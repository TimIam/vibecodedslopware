// Steam achievement icons, first half (see kit.js). Each entry draws one 64×64 icon; icons.html previews them and
// exports ×4. Hand-drawn bits are little pixel maps (one character a pixel, '.' clear) drawn through spr().

// ------------------------------------------------------------------------------------------------ local helpers

// a pixel map at scale s; pal maps characters to colours. ink: a 1 px ink outline round the whole shape first.
function spr(c, k, rows, x, y, pal, s = 1, { ink = false, flip = false } = {}) {
  const w = rows[0].length;
  const at = (i, j) => { const r = rows[j]; if (!r) return null; const ch = r[flip ? w - 1 - i : i]; return ch && ch !== '.' && pal[ch] ? pal[ch] : null; };
  if (ink) for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (at(i, j)) k.rect(c, x + i * s - 1, y + j * s - 1, s + 2, s + 2, k.PAL.ink);
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) { const col = at(i, j); if (col) k.rect(c, x + i * s, y + j * s, s, s, col); }
}
const off = (w = 64, h = 64) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
// paints a colour over everything already drawn on a canvas, keeping its shape
function tint(cv, col, a) {
  const x = cv.getContext('2d');
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return cv;
}
// draws an outline of ink round whatever is on cv (alpha > 0), into c at (x, y)
function inkAround(c, k, cv, x, y) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
  const on = (i, j) => i >= 0 && j >= 0 && i < W && j < H && d[(j * W + i) * 4 + 3] > 100;
  for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) k.put(c, x + i, y + j, k.PAL.ink);
}
// the boss drawn alone on a 64×64 canvas, centred
function bossCv(k, opts) { const cv = off(); k.boss(cv.getContext('2d'), 32, 32, 1, opts); return cv; }
// a soft round light: rings of a colour at falling alpha
function glow(c, k, cx, cy, r, col, a = 0.5) {
  for (let i = r; i > 0; i -= 2) { c.globalAlpha = a * (1 - i / (r + 1)) * 0.6; k.disc(c, cx, cy, i, col); }
  c.globalAlpha = 1;
}
// a fat line (w px across) in a colour
function thick(c, k, x0, y0, x1, y1, w, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) k.rect(c, x0 + (x1 - x0) * i / n - (w >> 1), y0 + (y1 - y0) * i / n - (w >> 1), w, w, col);
}
// three claw slashes down to the right from (x, y), each len long: dark gashes with a raw red edge
function slashes(c, k, x, y, len, gap = 7) {
  const each = f => { for (let s = 0; s < 3; s++) { const x0 = x + s * gap, y0 = y - s * 2; f(x0, y0, x0 + len * 0.55, y0 + len); } };
  each((x0, y0, x1, y1) => thick(c, k, x0, y0, x1, y1, 5, k.PAL.ink));
  each((x0, y0, x1, y1) => thick(c, k, x0, y0, x1, y1, 3, k.PAL.hpHi));
  each((x0, y0, x1, y1) => { const n = Math.abs(y1 - y0); for (let i = 3; i < n - 3; i++) { const t = i / n; k.put(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, '#5a0c08'); } });
}
// a level number on a little tab in the top-left corner
function tab(c, k, n) {
  k.rect(c, 2, 2, 10, 10, k.PAL.ink);
  k.rect(c, 3, 3, 8, 8, '#6a5038'); k.rect(c, 3, 3, 8, 1, '#8a6c4c');
  k.label(c, String(n), 7, 5, k.PAL.cream);
}

// ------------------------------------------------------------------------------------------------ pieces

const CROWN = [
  'y....y....y',
  'yy..yyy..yy',
  'yyy.yhy.yyy',
  'yyyyyyyyyyy',
  'yRyyyByyyRy',
  'yyyyyyyyyyy',
  'ddddddddddd',
];
const crownPal = k => ({ y: k.PAL.gold, h: '#fff2b0', R: '#e0403a', B: k.PAL.blue, d: '#b8902a' });

const SKULL5 = ['.bbb.', 'bbbbb', 'bkbkb', 'bbbbb', '.b.b.'];
const SKULL3 = ['bbb', 'kbk', 'b.b'];

const DIE = [
  '.wwwwwwwwwwww.',
  'wwwwwwwwwwwwww',
  'wwkkwwwwwwkkww',
  'wwkkwwwwwwkkww',
  'wwwwwwwwwwwwws',
  'wwwwwwwwwwwwws',
  'wwwwwwkkwwwwws',
  'wwwwwwkkwwwwws',
  'wwwwwwwwwwwwws',
  'wwwwwwwwwwwwws',
  'wwkkwwwwwwkkws',
  'wwkkwwwwwwkkws',
  'wssssssssssssd',
  '.ssssssssssss.',
];

// the stones of level 1's henge, w×h, standing on y
function stone(c, k, x, y, w, h, seed = 1) {
  const P = k.PAL;
  const top = y - h;
  k.rect(c, x - 1, y, w + 3, 1, 'rgba(8,10,6,.5)');
  k.rect(c, x - 1, top, w + 2, h + 1, P.ink);
  k.put(c, x - 1, top, 'rgba(0,0,0,0)');
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w; i++) {
    if ((j === 0 && (i === 0 || i === w - 1))) continue;
    const l = 0.75 - i / w + (j < 2 ? 0.3 : 0) + (k.hash(i + seed * 13, j + seed) - 0.5) * 0.45;
    k.put(c, x + i, top + 1 + j, l > 0.75 ? P.rock4 : l > 0.35 ? P.rock3 : l > -0.05 ? P.rock2 : P.rock1);
  }
  k.put(c, x - 1 + 0, top, P.ink);
  for (let i = 0; i < w; i += 2) if (k.hash(i, seed) < 0.6) k.put(c, x + i, y - 1, P.moss);
}

// a street lamp: an iron post and a glass lantern, lit
function lamp(c, k, x, y, h, lit = true) {
  const P = k.PAL;
  if (lit) glow(c, k, x + 1, y - h + 3, 14, '#ffd27a', 0.9);
  k.rect(c, x - 1, y - h + 6, 4, h - 6, P.ink); k.rect(c, x, y - h + 6, 2, h - 6, '#3a3f48'); k.rect(c, x, y - h + 6, 1, h - 6, '#5a6270');
  k.rect(c, x - 2, y - 2, 6, 3, P.ink); k.rect(c, x - 1, y - 2, 4, 2, '#3a3f48');
  // lantern
  spr(c, k, ['.kkkk.', 'kkkkkk', 'kgyygk', 'kyffyk', 'kyffyk', 'kgyygk', 'kkkkkk', '..kk..'], x - 2, y - h - 2, { k: '#22262e', g: '#c88a2a', y: '#ffd75a', f: '#fff6c0' }, 1, { ink: true });
}

// raid frames: rows × cols of little dead boxes, class colours greyed out, a skull in each
const RAID_CLS = ['warrior', 'priest', 'mage', 'rogue', 'hunter', 'paladin', 'warlock', 'druid', 'berserker'];
function frames(c, k, cols, rows, cw, ch, x0, y0, skull) {
  const P = k.PAL;
  let n = 0;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++, n++) {
    const x = x0 + q * (cw + 1), y = y0 + r * (ch + 1), cls = RAID_CLS[(n * 7 + r) % RAID_CLS.length];
    k.rect(c, x, y, cw, ch, P.ink);
    k.rect(c, x + 1, y + 1, cw - 2, ch - 2, '#2a2624');
    k.rect(c, x + 1, y + 1, cw - 2, 1, k.mix(P[k.CLASS[cls].col], '#2a2624', 0.45));
    k.rect(c, x + 1, y + ch - 3, cw - 2, 1, P.hpLo);
    const sk = skull === 5 ? SKULL5 : SKULL3, sw = sk[0].length;
    spr(c, k, sk, x + Math.floor((cw - sw) / 2), y + Math.floor((ch - sk.length) / 2) , { b: P.rock3, k: P.ink });
  }
}

// a castle keep seen from the front: two towers and a wall between, w wide, base on y
function keep(c, k, x, y, ruined = false) {
  const P = k.PAL, cv = off(), x2 = cv.getContext('2d');
  const st = (i, j) => { const h = k.hash(i, j * 3); return h < 0.15 ? P.rock1 : h < 0.75 ? P.rock2 : P.rock3; };
  const block = (bx, by, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const brick = (j % 3 === 2) || ((i + (Math.floor(j / 3) % 2) * 2) % 5 === 0); k.put(x2, bx + i, by + j, brick ? P.rock1 : st(bx + i, by + j)); } };
  const merlons = (bx, by, w) => { for (let i = 0; i < w; i += 4) block(bx + i, by - 3, 2, 3); };
  block(8, 20, 48, 26); merlons(8, 20, 48);                      // the wall
  block(2, 8, 16, 38); merlons(2, 8, 16);                        // towers
  block(46, 8, 16, 38); merlons(46, 8, 16);
  block(22, 2, 20, 18); merlons(22, 2, 20);                      // the keep behind
  // gate, windows
  k.rect(x2, 27, 32, 10, 14, P.ink); k.rect(x2, 28, 33, 8, 13, '#5a3a20');
  for (let i = 0; i < 8; i += 2) k.rect(x2, 28 + i, 33, 1, 13, '#3a2414');
  k.rect(x2, 27, 31, 10, 1, P.rock1);
  for (const [wx, wy] of [[9, 18], [9, 28], [53, 18], [53, 28], [31, 8]]) { k.rect(x2, wx, wy, 2, 4, P.ink); }
  if (ruined) {
    // how far down each column is knocked (y in the 64×46 sprite): the left tower chipped, the keep broken in half,
    // the right tower and the right of the wall down to stumps, a breach left of the gate
    const brk = i => i < 10 ? 13 + (i > 6 ? 2 : 0) : i < 22 ? 22 + Math.round(k.hash(i, 4) * 3) + (i > 13 && i < 19 ? 9 : 0)
      : i < 42 ? 10 + Math.round(Math.abs(i - 30) * 0.7 + k.hash(i, 5) * 3) : i < 47 ? 30 + Math.round(k.hash(i, 6) * 3) : 33 + Math.round(k.hash(i, 7) * 4);
    for (let i = 0; i < 64; i++) x2.clearRect(i, 0, 1, brk(i));
    // cracks
    for (const [cx, cy, len, d] of [[6, 20, 9, 1], [26, 22, 7, -1], [36, 18, 8, 1], [49, 36, 5, -1]]) for (let j = 0; j < len; j++) k.put(x2, cx + Math.round(j * 0.4 * d) + (j % 2), cy + j, P.ink);
    // rubble heaped against the foot
    for (let n = 0; n < 70; n++) {
      const rx = 4 + k.hash(n, 11) * 56, near = Math.abs(rx - 16) < 7 || rx > 40, ry = 44 - k.hash(n, 12) * (near ? 9 : 4);
      const w = 2 + Math.floor(k.hash(n, 13) * 3);
      k.rect(x2, rx, ry, w, 2, P.ink); k.rect(x2, rx, ry, w - 1, 1, k.hash(n, 14) < 0.5 ? P.rock2 : P.rock3);
    }
  }
  inkAround(c, k, cv, x - 32, y - 46);
  c.drawImage(cv, x - 32, y - 46);
}

// "x5" centred on cx in the game's font at scale s, with a lower-case x drawn by hand (the font only has capitals)
function x5(c, k, cx, y, col, s) {
  const x0 = Math.round(cx - k.textWidth('X5', s) / 2);
  for (const [dx, dy, cc] of [[0, s, k.PAL.ink], [s, s, k.PAL.ink], [0, 0, col]])
    ['#.#', '.#.', '#.#'].forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') k.rect(c, x0 + i * s + dx, y + (2 + j) * s + dy, s, s, cc); }));
  k.drawText(c, '5', x0 + 4 * s, y, col, { scale: s });
}

// ------------------------------------------------------------------------------------------------ icons

export const ICONS = {
  // the dice: a so-so randomized boss, the die, and a shrug of a tick
  THATLL_DO: (c, k) => {
    k.backdrop(c, '#2a3a44', '#0c1418', '#46606c');
    k.boss(c, 30, 30, 1, { dir: 8, look: { head: 3, horns: 1, neck: 4, back: 3, tail: 4, limbs: 1, legs: 0, fur: '#8a8a3a' } });
    spr(c, k, DIE, 44, 44, { w: '#f2efe2', k: k.PAL.ink, s: '#b8b4a4', d: '#8a8678' }, 1, { ink: true });
    // the tick
    thick(c, k, 6, 50, 10, 55, 4, k.PAL.ink); thick(c, k, 10, 55, 19, 44, 4, k.PAL.ink);
    thick(c, k, 6, 50, 10, 55, 2, k.PAL.heal); thick(c, k, 10, 55, 19, 44, 2, k.PAL.heal);
  },

  // the worst the dice can do, and the red revert arrow
  OH_GOD_NO: (c, k) => {
    k.backdrop(c, '#3a1a44', '#100614', '#5a2a66');
    k.boss(c, 32, 31, 1, { dir: 8, mouth: true, look: { head: 1, horns: 2, neck: 3, back: 4, tail: 2, limbs: 3, legs: 2, fur: '#d04aa0' } });
    // the revert arrow, curling round anticlockwise
    const P = k.PAL, R = '#ff4a3a';
    for (const [col, w] of [[P.ink, 4], [R, 2]]) {
      for (let a = 0.4; a < 4.4; a += 0.08) { const x = 51 + Math.cos(a) * 7, y = 12 - Math.sin(a) * 7; k.rect(c, x - (w >> 1), y - (w >> 1), w, w, col); }
    }
    spr(c, k, ['r....', 'rr...', 'rrr..', 'rrrr.', 'rrrrr'], 54, 13, { r: R }, 1, { ink: true });
  },

  // the patrol: two stones, a worn loop between them, and the multiplier at full
  AIMLESS: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#3a4a2a', '#141c0e', '#56683e');
    // worn loop (a stadium) of footprints
    const ring = [];
    for (let s = 0; s < 1; s += 0.012) {
      const per = 2 * 30 + 2 * Math.PI * 9, d = s * per;
      let x, y;
      if (d < 30) { x = 17 + d; y = 18; } else if (d < 30 + Math.PI * 9) { const a = (d - 30) / 9 - Math.PI / 2; x = 47 + Math.cos(a) * 9; y = 27 + Math.sin(a) * 9; }
      else if (d < 60 + Math.PI * 9) { x = 47 - (d - 30 - Math.PI * 9); y = 36; } else { const a = (d - 60 - Math.PI * 9) / 9 + Math.PI / 2; x = 17 + Math.cos(a) * 9; y = 27 + Math.sin(a) * 9; }
      ring.push([x, y]);
    }
    for (const [x, y] of ring) { k.rect(c, x - 1, y - 1, 3, 3, '#4a3a24'); }
    ring.forEach(([x, y], i) => { if (i % 4 === 0) k.put(c, x, y, P.dirt3); });
    k.rock(c, false, 17, 27, 1);
    k.rock(c, true, 47, 27, 1);
    x5(c, k, 32, 44, P.gold, 3);
  },

  // vengeance at full: the boss roaring out of a wall of fire
  BURNING_RAGE: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#5a140a', '#1a0604', '#8a2a14');
    const flames = (base, amp, ph, cols) => {
      for (let x = 2; x < 62; x++) {
        const h = Math.round(amp * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.42 + ph))) + k.hash(x, ph * 9) * 5);
        for (let j = 0; j < h; j++) { const t = j / h; k.put(c, x, base - j, t > 0.8 ? cols[0] : t > 0.5 ? cols[1] : t > 0.2 ? cols[2] : cols[3]); }
      }
    };
    flames(61, 30, 0.3, [P.fire0, P.fire1, P.fire1, P.fire2]);
    k.boss(c, 32, 30, 1, { dir: 8, mouth: true });
    flames(61, 14, 1.7, [P.fire1, P.fire2, P.fire2, P.fire3]);
    for (let i = 0; i < 14; i++) k.put(c, 4 + k.hash(i, 3) * 56, 4 + k.hash(i, 7) * 30, i % 2 ? P.ember : P.fire2);
    x5(c, k, 32, 49, P.fire3, 2);
  },

  // the five melee abilities, as their HUD icons in slots: Swipe, Stomp, Stun Charge over Tail Sweep, Zoomies
  DO_YOU_PRACTICE: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#4a3a26', '#18120a', '#6a5638');
    const slot = (x, y, id) => {
      k.rect(c, x, y, 18, 18, P.ink); k.rect(c, x + 1, y + 1, 16, 16, '#241c14');
      k.abilIcon(c, id, x + 1, y + 1, 2, P.cream);
    };
    slot(4, 11, 'swipe'); slot(23, 11, 'stomp'); slot(42, 11, 'charge');
    slot(13, 35, 'tail'); slot(33, 35, 'haste');
  },

  // beat the game melee-only: the king's crown, clawed off his head
  DO_YOU_FIGHT: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#6a5014', '#1e1404', '#a07c24');
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.line(c, 32, 34, 32 + Math.cos(a) * 40, 34 + Math.sin(a) * 40, '#7a5c18'); }
    slashes(c, k, 14, 8, 46, 10);
    spr(c, k, CROWN, 15, 26, crownPal(k), 3, { ink: true });
  },

  // a flask of mutagen with the boss's head soaking in it
  TEST_SUBJECT: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#1e3a22', '#08140a', '#36603a');
    const GLASS = '#cfeee0', LIQ = '#58d84a', LIQD = '#2e8a34';
    // flask shape: neck 24..39, body widening below y 22
    const inside = (x, y) => (y >= 7 && y < 22 && x >= 26 && x <= 37) || (y >= 22 && y <= 58 && Math.abs(x - 31.5) <= 6 + (y - 22) * 0.62 && !(y > 55 && Math.abs(x - 31.5) > 6 + (y - 22) * 0.62 - (y - 55)));
    for (let y = 4; y < 61; y++) for (let x = 3; x < 61; x++) {
      if (inside(x, y)) continue;
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) k.put(c, x, y, P.ink);
    }
    for (let y = 7; y < 59; y++) for (let x = 4; x < 60; x++) if (inside(x, y)) k.put(c, x, y, y >= 30 ? (y === 30 ? '#a6ff8a' : LIQ) : '#20402a');
    // the boss's head, sunk in it
    const b = bossCv(k, { dir: 24, look: { fur: '#6a9a3a' } });
    tint(b, LIQ, 0.3);
    const mask = off(), mx = mask.getContext('2d');
    for (let y = 31; y < 59; y++) for (let x = 4; x < 60; x++) if (inside(x, y)) k.put(mx, x, y, '#fff');
    mx.globalCompositeOperation = 'source-in'; mx.drawImage(b, 0, 22);
    c.drawImage(mask, 0, 0);
    // glass shine and the lip
    for (let y = 24; y < 54; y += 1) k.put(c, Math.round(31.5 - 4 - (y - 22) * 0.62), y, GLASS);
    k.rect(c, 27, 9, 1, 12, GLASS);
    k.rect(c, 23, 4, 18, 4, P.ink); k.rect(c, 24, 5, 16, 2, GLASS);
    // bubbles
    for (const [x, y, r] of [[36, 25, 1], [30, 20, 0], [33, 14, 1], [29, 10, 0], [40, 36, 0], [24, 44, 0]]) { if (r) { k.rect(c, x - 1, y, 3, 1, '#a6ff8a'); k.rect(c, x, y - 1, 1, 3, '#a6ff8a'); k.put(c, x, y, '#20402a'); } else k.put(c, x, y, '#a6ff8a'); }
  },

  // two ability slots trading places
  LIFE_FINDS_A_WAY: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#2c3a30', '#0c140e', '#4a6050');
    const slot = (x, y, id, col) => {
      k.rect(c, x, y, 22, 22, P.ink); k.rect(c, x + 1, y + 1, 20, 20, '#5a4a36'); k.rect(c, x + 2, y + 2, 18, 18, '#241c14');
      k.abilIcon(c, id, x + 3, y + 3, 2, col);
    };
    slot(5, 21, 'breath', P.fire2);
    slot(37, 21, 'swipe', P.cream);
    // arrows: over the top left to right, under the bottom right to left
    const arc = (cy, up, col, w) => { for (let a = 0.25; a < Math.PI - 0.25; a += 0.05) { const x = 32 - Math.cos(a) * 17, y = cy + (up ? -1 : 1) * Math.sin(a) * 10; k.rect(c, x - (w >> 1), y - (w >> 1), w, w, col); } };
    arc(19, true, P.ink, 4); arc(19, true, P.gold, 2);
    arc(45, false, P.ink, 4); arc(45, false, P.gold, 2);
    spr(c, k, ['g...', 'gg..', 'ggg.', 'gggg', 'ggg.', 'gg..', 'g...'].map(r => r), 47, 12, { g: P.gold }, 1, { ink: true });
    spr(c, k, ['...g', '..gg', '.ggg', 'gggg', '.ggg', '..gg', '...g'], 13, 45, { g: P.gold }, 1, { ink: true });
  },

  // an ability glyph growing up a staircase, three pips lit
  ITS_EVOLUTION: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#2a3a1a', '#0c1406', '#48602c');
    k.abilIcon(c, 'breath', 5, 46, 1, '#7a6a4a');
    k.abilIcon(c, 'breath', 13, 30, 2, '#c8902a');
    k.abilIcon(c, 'breath', 31, 6, 3, P.fire3);
    glow(c, k, 43, 18, 16, P.fire2, 0.5);
    k.abilIcon(c, 'breath', 31, 6, 3, P.fire3);
  },

  // Test Subject's flask, with a jawless skull over it, red-eyed
  BECOME_DEATH: (c, k) => {
    const P = k.PAL;
    ICONS.TEST_SUBJECT(c, k);
    glow(c, k, 25, 35, 5, '#ff2a1a', 0.7); glow(c, k, 39, 35, 5, '#ff2a1a', 0.7);
    spr(c, k, [
      '....bbbbb....',
      '..bbbbbbbbb..',
      '.bbbbbbbbbbd.',
      'bbbbbbbbbbbbd',
      'bbbbbbbbbbbbd',
      'bkkkbbbbbkkkd',
      'bkRkbbbbbkRkd',
      'bkkkbbkbbkkkd',
      '.bbbbkkkbbbd.',
      '..bbbbbbbdd..',
      '..b.b.b.b.d..',
    ], 19, 24, { b: P.bone, d: '#a89a7a', k: P.ink, R: '#ff3a24' }, 2, { ink: true });
  },

  // ---------------------------------------------------------------- the levels

  // level 1: the boss on his leash between the stones, heroes on the way
  LEVEL_1: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#36502a', '#121c0c', '#56703e');
    k.rock(c, false, 9, 27, 1);
    k.rock(c, true, 55, 27, 1);
    k.boss(c, 32, 25, 1, { dir: 8, mouth: true });
    k.hero(c, 'warrior', 14, 54, 2);
    k.hero(c, 'mage', 32, 56, 2);
    k.hero(c, 'priest', 50, 54, 2);
    tab(c, k, 1);
  },

  // level 2: the forest, one tree already flattened
  LEVEL_2: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#2c4a26', '#0e1a0c', '#4a6a3a');
    k.prop(c, 'oak', 20, 19, 2);
    k.prop(c, 'pine', 47, 21, 2);
    // a pine felled across the clearing: a tapering barked trunk from the splintered stump, the crown a herringbone
    // of boughs swept back toward the stump, lit along its top edge, with its shadow on the grass
    const T0 = [16, 50], T1 = [54, 39];              // the cut end and the tip
    const dx = T1[0] - T0[0], dy = T1[1] - T0[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const at = (t, o = 0) => [T0[0] + dx * t + nx * o, T0[1] + dy * t + ny * o];
    for (let t = 0.05; t < 1; t += 0.01) { const [x, y] = at(t, 4); k.rect(c, x - 1, y, 3, 2, 'rgba(6,12,4,.45)'); }
    const tree = off(), tx = tree.getContext('2d');
    // the trunk, 6 px at the cut down to 2 at the tip, bark darker underneath, a ring of lighter bark every few px
    for (let i = 0; i <= len; i += 0.5) {
      const t = i / len, w = 2.5 - t * 1.5;
      for (let o = -w; o <= w; o += 0.5) {
        const [x, y] = at(t, o), side = o / w;
        k.put(tx, x, y, side < -0.4 ? '#8a5a32' : side > 0.45 ? '#3e2814' : (Math.floor(i) % 5 === 0 ? '#7a4e2a' : '#5e3c20'));
      }
    }
    // boughs: pairs of branches either side, swept back toward the stump, each a darker stem with needle tufts,
    // longest low in the crown, gaps between them so they read as boughs; the upper side lit
    const NEED = ['#1c3a24', '#24482c', P.needle, '#3e7a4c', '#4a8a5a'];
    for (let t = 0.95; t > 0.42; t -= 0.09) {
      const reach = 2 + Math.sin(Math.min(1, (1 - t) / 0.62) * Math.PI * 0.8) * 5;
      for (const side of [-1, 1]) {
        const lit = side < 0;
        for (let r = 0; r <= reach; r += 0.5) {
          const [bx, by] = at(t - r * 0.05, side * r);
          k.put(tx, bx, by, NEED[1]);
          // needle tufts either side of the stem, thinning toward its tip
          const tuft = r < reach - 1 ? 1 : 0;
          for (const o of [-1, 1]) if (tuft || o < 0) {
            const [px, py] = [bx + ux * o * 1.2, by + uy * o * 1.2];
            const n = (lit ? 3 : 2) + (o > 0 ? 0 : 1) - (k.hash(Math.round(px * 3), Math.round(py * 3)) < 0.25 ? 1 : 0);
            k.put(tx, px, py, NEED[Math.min(4, n)]);
          }
        }
      }
    }
    // a little snow-bright highlight along the top of the crown, the tip's leader
    { const [x, y] = at(1.02); k.put(tx, x, y, NEED[2]); }
    inkAround(c, k, tree, 0, 0);
    c.drawImage(tree, 0, 0);
    // the stump it came off, and the cut face of the trunk beside it
    spr(c, k, ['.w.ww.', 'wwwwww', 'wsrrsw', 'wsrrsw', 'wssssw', '.wwww.'], 3, 46, { w: P.splinter, s: '#8a5a32', r: '#b08050' }, 2, { ink: true });
    k.disc(c, T0[0], T0[1], 2, '#c89a62'); k.put(c, T0[0], T0[1], '#8a5a32');
    for (const [x, y] of [[18, 56], [8, 44], [22, 45], [14, 58], [26, 54]]) k.put(c, x, y, P.splinter);
    tab(c, k, 2);
  },

  // level 3: the farms: a barn, the livestock, the wheat
  LEVEL_3: (c, k) => {
    k.backdrop(c, '#5a4a1e', '#1c160a', '#806a30');
    k.prop(c, 'barn', 32, 18, 1);
    for (let i = 0; i < 6; i++) k.prop(c, 'wheat', 8 + i * 9, 34, 2);
    k.critter(c, 'cow', 20, 48, 2);
    k.critter(c, 'pig', 46, 50, 2);
    k.critter(c, 'chicken', 34, 56, 2);
    tab(c, k, 3);
  },

  // level 4: a thatched-roof cottage and its people, leaving
  LEVEL_4: (c, k) => {
    k.backdrop(c, '#5a3e1e', '#1c1208', '#866038');
    k.prop(c, 'cottage', 32, 25, 2);
    k.critter(c, 'villager', 14, 52, 3, { scared: 1, moving: true, fx: -1 });
    k.critter(c, 'villager', 50, 52, 3, { scared: 1, moving: true, fx: 1, seed: 3 });
    tab(c, k, 4);
  },

  // level 5: the moat bridged with the wall's own rubble, up to the raised drawbridge
  LEVEL_5: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#3a4450', '#10141a', '#5a6470');
    // the wall
    for (let y = 4; y < 28; y++) for (let x = 2; x < 62; x++) { const brick = (y % 4 === 3) || ((x + (Math.floor(y / 4) % 2) * 3) % 6 === 0); k.put(c, x, y, brick ? P.rock1 : k.hash(x, y) < 0.7 ? P.rock2 : P.rock3); }
    for (let x = 2; x < 62; x += 6) k.rect(c, x, 2, 4, 2, P.rock2);
    k.rect(c, 2, 4, 60, 1, P.rock1);
    // the gateway, its bridge pulled up against it, chains
    k.rect(c, 23, 9, 18, 19, P.ink);
    k.rect(c, 24, 10, 16, 18, '#6a4422');
    for (let x = 24; x < 40; x += 3) k.rect(c, x, 10, 1, 18, '#4a2c14');
    k.rect(c, 24, 14, 16, 1, '#3a2414'); k.rect(c, 24, 23, 16, 1, '#3a2414');
    k.line(c, 19, 6, 24, 11, '#c8ccd4'); k.line(c, 44, 6, 39, 11, '#c8ccd4');
    // moat
    for (let y = 28; y < 46; y++) for (let x = 2; x < 62; x++) k.put(c, x, y, (y === 28) ? P.ink : ((x + y * 3) % 11 === 0 && k.hash(x, y) < 0.5) ? P.splash : y < 31 ? '#1e4058' : '#26506e');
    // the near bank
    for (let y = 46; y < 62; y++) for (let x = 2; x < 62; x++) k.put(c, x, y, y === 46 ? P.ink : k.hash(x, y) < 0.2 ? P.grass3 : P.grass2);
    // the causeway of rubble across it
    const blocks = [[25, 29], [31, 30], [36, 29], [23, 33], [29, 34], [35, 33], [26, 38], [32, 38], [38, 37], [24, 42], [30, 42], [36, 42]];
    blocks.forEach(([x, y], i) => {
      k.rect(c, x - 1, y - 1, 7, 6, P.ink);
      k.rect(c, x, y, 5, 4, i % 3 ? P.rock2 : P.rock3); k.rect(c, x, y, 5, 1, P.rock4); k.rect(c, x, y + 3, 5, 1, P.rock1);
    });
    tab(c, k, 5);
  },

  // level 6: the town at night, lamps lit
  LEVEL_6: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#1a2240', '#080a14', '#2e3a60');
    for (let i = 0; i < 18; i++) k.put(c, 4 + k.hash(i, 1) * 56, 4 + k.hash(i, 2) * 22, i % 3 ? '#8a94c0' : '#ffffff');
    k.disc(c, 48, 13, 6, '#e8e6c8'); k.disc(c, 50, 11, 5, '#1a2240');
    const t = off(), tx = t.getContext('2d');
    k.prop(tx, 'city_house', 18, 41, 1);
    k.prop(tx, 'city_pub', 47, 43, 1);
    tint(t, '#101830', 0.3);
    c.drawImage(t, 0, 0);
    k.rect(c, 2, 56, 60, 6, '#14141c');
    lamp(c, k, 31, 60, 26, true);
    tab(c, k, 6);
  },

  // level 7: the castle and the king's keep
  LEVEL_7: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#4a4a50', '#141418', '#6a6a72');
    k.rect(c, 2, 52, 60, 10, '#2a2a20');
    keep(c, k, 32, 52, true);
    // one banner left, stuck in the top of the broken keep
    k.rect(c, 31, 6, 1, 12, P.ink);
    spr(c, k, ['rrrrr', 'rryrr', 'ryyyr', 'rryrr', 'rrrr.', 'rrr..'], 32, 6, { r: '#a8261e', y: P.gold }, 1, { ink: true });
    tab(c, k, 7);
  },

  // ---------------------------------------------------------------- beating it

  // NG+: the boss wears the crown now
  NG_PLUS: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#7a5a14', '#201404', '#b08a2a');
    glow(c, k, 32, 30, 30, P.gold, 0.5);
    k.boss(c, 32, 36, 1, { dir: 24 });
    spr(c, k, CROWN, 21, 6, crownPal(k), 2, { ink: true });
    k.label(c, '+', 54, 6, P.cream, 2);
  },

  // NG+5: a stack of five crowns, as you do
  NG_PLUS_5: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#7a5a14', '#201404', '#b08a2a');
    for (let i = 0; i < 5; i++) spr(c, k, CROWN, 21 + [0, 2, -1, 1, -2][i], 50 - i * 10, crownPal(k), 2, { ink: true });
    k.label(c, '5', 52, 6, P.cream, 2);
  },

  // the last lamp in town, snapped
  EVERY_LAST_LAMPPOST: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#26305a', '#0a0e1c', '#3e4a7a');
    for (let i = 0; i < 14; i++) k.put(c, 4 + k.hash(i, 5) * 56, 4 + k.hash(i, 6) * 26, i % 3 ? '#8a94c0' : '#ffffff');
    // the dark ones further down the street
    for (const [x, h] of [[44, 18], [54, 13]]) { k.rect(c, x, 48 - h, 2, h, '#1a2038'); k.rect(c, x - 1, 46 - h, 4, 3, '#1a2038'); }
    k.rect(c, 2, 48, 60, 14, '#22222c'); k.rect(c, 2, 48, 60, 1, '#3a3a48');
    for (let x = 4; x < 62; x += 8) k.rect(c, x, 55, 4, 1, '#2e2e3a');
    const IRON = '#4a5466', IRONHI = '#7a8498';
    // the post, bent double halfway up: the upright part
    k.rect(c, 13, 18, 7, 37, P.ink); k.rect(c, 14, 19, 5, 35, IRON); k.rect(c, 14, 19, 1, 35, IRONHI);
    k.rect(c, 11, 51, 11, 5, P.ink); k.rect(c, 12, 52, 9, 3, IRON); k.rect(c, 12, 52, 9, 1, IRONHI);
    // the rest folded over and down
    thick(c, k, 17, 19, 42, 34, 7, P.ink); thick(c, k, 17, 19, 42, 34, 5, IRON); k.line(c, 17, 17, 42, 32, IRONHI);
    // the lantern, dangling and smashed, still guttering
    glow(c, k, 45, 42, 14, '#ffd27a', 0.8);
    spr(c, k, ['.kkkkk.', 'kkkkkkk', 'kyf.gyk', 'kf..y.k', 'ky.f..k', 'kgy.ygk', 'kkkkkkk', '..kkk..'], 41, 36, { k: '#22262e', g: '#c88a2a', y: '#ffd75a', f: '#fff6c0' }, 1, { ink: true });
    for (const [x, y] of [[36, 52], [52, 50], [56, 54], [40, 57], [49, 56], [31, 56], [58, 50]]) { k.put(c, x, y, '#dff4ff'); k.put(c, x + 1, y, '#8cc8de'); }
    for (const [x, y, col] of [[52, 34, P.ember], [55, 31, P.fire2], [50, 30, P.ember], [57, 38, P.fire3]]) k.put(c, x, y, col);
  },

  // the keep, down to a pile with the king's flag in it
  TOTAL_ANNIHILATION: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#4a3a34', '#141010', '#6a5a52');
    // smoke
    for (const [x, y, r] of [[16, 18, 7], [24, 11, 6], [44, 16, 8], [38, 8, 5], [30, 22, 6]]) k.disc(c, x, y, r, '#5a524c');
    for (const [x, y, r] of [[15, 16, 4], [43, 13, 5], [24, 9, 3]]) k.disc(c, x, y, r, '#6a625c');
    // rubble heap
    const cv = off(), x2 = cv.getContext('2d');
    const top = x => 58 - 26 * Math.max(0, 1 - ((x - 32) / 27) ** 2) - (k.hash(x, 7) < 0.3 ? 1 : 0);
    for (let x = 4; x < 61; x++) for (let y = Math.round(top(x)); y < 58; y++) k.put(x2, x, y, k.hash(x * 3, y) < 0.3 ? P.rock0 : P.rock1);
    for (let i = 0; i < 90; i++) {
      const a = k.hash(i, 1);
      const bx = 6 + a * 50, by = top(bx) + 1 + k.hash(i, 2) * (58 - top(bx)) * 0.8;
      const w = 3 + Math.floor(k.hash(i, 3) * 4), h = 2 + Math.floor(k.hash(i, 4) * 3);
      k.rect(x2, bx, by, w, h, P.ink); k.rect(x2, bx + 1, by + 1, w - 1, h - 1, k.hash(i, 5) < 0.3 ? P.rock3 : P.rock2); k.rect(x2, bx + 1, by + 1, w - 1, 1, P.rock4);
    }
    inkAround(c, k, cv, 0, 0);
    c.drawImage(cv, 0, 0);
    k.rect(c, 2, 58, 60, 4, '#241a16');
    // the flag, stuck in it at an angle
    thick(c, k, 28, 37, 34, 14, 2, P.ink); k.line(c, 28, 36, 34, 14, '#8a5a32');
    spr(c, k, ['rrrrrrr', 'rrryrrr', 'rryyyrr', 'rrryrr.', 'rrrrr..', 'rrrr...'], 35, 14, { r: '#a8261e', y: P.gold }, 1, { ink: true });
    for (const [x, y] of [[20, 44], [44, 47], [36, 52]]) { k.put(c, x, y, P.fire2); k.put(c, x, y - 1, P.ember); }
  },

  // ---------------------------------------------------------------- the people

  // who was that guy: his horse, standing alone, and his hat in the dirt
  WHO_WAS_THAT_GUY: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#8a4a24', '#1e0e12', '#b0683a');
    k.disc(c, 32, 40, 14, '#d8883a'); k.disc(c, 32, 40, 12, '#f0b050');
    k.rect(c, 2, 40, 60, 22, '#3a2416'); k.rect(c, 2, 40, 60, 1, '#5a3a22');
    k.critter(c, 'horse', 30, 36, 3, { fx: 1 });
    spr(c, k, ['...tttt...', '..ttttttt.', '..tdddddt.', 'tttttttttt'], 38, 52, { t: P.tan, d: '#8a6a3a' }, 2, { ink: true });
    k.label(c, '?', 52, 10, P.cream, 2);
  },

  // a five-man party, every frame dead
  PARTY_WIPE: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#4a1414', '#140606', '#702a22');
    ['warrior', 'priest', 'mage', 'rogue', 'hunter'].forEach((cls, i) => {
      const x = 5, y = 5 + i * 11;
      k.rect(c, x, y, 54, 10, P.ink);
      k.rect(c, x + 1, y + 1, 8, 8, k.mix(P[k.CLASS[cls].col], '#2a2624', 0.5));
      spr(c, k, SKULL5, x + 3 - 1, y + 3 - 1, { b: P.bone, k: P.ink });
      k.rect(c, x + 10, y + 1, 43, 8, P.hpBg);
      k.rect(c, x + 10, y + 1, 43, 1, k.mix(P[k.CLASS[cls].col], P.hpBg, 0.5));
      k.label(c, 'DEAD', x + 32, y + 3, P.rock3);
    });
  },

  // 25: five by five raid frames, all dead
  RAID_WIPE: (c, k) => {
    k.backdrop(c, '#3a1a4a', '#100614', '#5a3070');
    frames(c, k, 5, 5, 10, 10, 6, 6, 5);
  },

  // 40: eight by five
  FULL_CLEAR: (c, k) => {
    k.backdrop(c, '#7a5a14', '#201404', '#b08a2a');
    frames(c, k, 8, 5, 6, 10, 4, 6, 3);
  },

  // the necromancer raising the horse guy, hat and all
  FOR_THE_HORSE: (c, k) => {
    const P = k.PAL;
    k.backdrop(c, '#2a1a3a', '#0a1408', '#4a2e5e');
    k.rect(c, 2, 48, 60, 14, '#1e1a14');
    glow(c, k, 44, 34, 20, P.heal, 0.7);
    // the horse guy, back up out of the ground: hat, knife, nothing else
    spr(c, k, [
      '...TTTT...',
      '...TddT...',
      '.TTTTTTTT.',
      'b..bbbb..b',
      'b..bkbk..b',
      'b..bbbb..b',
      '.b..bb..b.',
      '..bbbbbb..',
      '....bb....',
      '..bbbbbb..',
      '....bb....',
      '..bbbbbb..',
      '....bb....',
    ], 34, 20, { T: P.tan, d: '#8a6a3a', b: P.bone, k: '#2a1a1a' }, 2, { ink: true });
    spr(c, k, ['S', 'S', 'S', 'w'], 52, 17, { S: P.steelHi, w: P.brown }, 2, { ink: true });
    // the grave he came out of
    spr(c, k, ['...dddddddddddd...', '.dddDdddddddDddddd.', 'dddddddDdddddddDddd'], 26, 44, { d: '#4a3624', D: '#6a5034' }, 2, { ink: true });
    // the necromancer, staff up
    spr(c, k, [
      '....PP.....',
      '...PPPP..GG',
      '..PPPPPP.GG',
      '..PpggpP..s',
      '..PppppP..s',
      '.PPPPPPPP.s',
      '.PpPPPPPhhs',
      'PPpPPPPPP.s',
      'PPpPPPPPP.s',
      'PPpPPPPPP.s',
      'PPPpPPPPP.s',
      'PPPpPPPPP.s',
      'PPPPpPPPP.s',
      'PPPPPPPPP.s',
    ], 5, 20, { P: '#5a3470', p: '#2e1a3c', g: P.heal, G: P.heal, s: P.brown, h: '#c8d0b0' }, 2, { ink: true });
    // the spell going over
    for (let i = 0; i < 9; i++) { const t = i / 8; k.put(c, 26 + t * 14, 20 - Math.sin(t * Math.PI) * 9, i % 2 ? P.heal : '#c8ffb0'); }
    for (const [x, y] of [[32, 30], [29, 36], [58, 24], [56, 36], [46, 14]]) k.put(c, x, y, P.heal);
  },
};
