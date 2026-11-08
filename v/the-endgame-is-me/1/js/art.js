// Palette, the 3×5 pixel font, icons, and the boss sprite sheet (sampled in code at load, 32 headings).

export const PAL = {
  ink: '#14100c', night: '#141a12',
  grass0: '#24331d', grass1: '#2c3e23', grass2: '#364b2a', grass3: '#425a31', tuft: '#56763a', tuftHi: '#6c8f46',
  canopy0: '#0f1a10', canopy1: '#16261a', canopy2: '#1f3523', canopy3: '#2c4a2c',
  dirt0: '#3f3222', dirt1: '#54432d', dirt2: '#6a5538', dirt3: '#7e6744',
  rock0: '#2f302c', rock1: '#55564f', rock2: '#7f7f74', rock3: '#aeac9b', rock4: '#d2cfbd', moss: '#4f6a32',
  fur0: '#2a1912', fur1: '#46291b', fur2: '#633b25', fur3: '#835233', fur4: '#a06a43',
  horn: '#e6d9b8', hornD: '#a8977a', eye: '#ffd23f', snout: '#8d5f42', mouth: '#c0392b', sigil: '#6ff3e8',
  steel: '#a9b4c2', steelHi: '#dde6f0', white: '#f2efe2', orange: '#e8892e', yellow: '#e8d23a', red: '#d8473a',
  pink: '#ee8fbf', blue: '#5b8cff', purple: '#a463e0', green: '#58b84a', brown: '#8a5a32', tan: '#d8c39a',
  skin: '#e8b48a', hair: '#2a1d14', horse: '#5a3d29', horseD: '#3a281b', mane: '#1a120c',
  tele: '#ff3b2a', fire0: '#7a1a0e', fire1: '#d64a18', fire2: '#ffa22b', fire3: '#fff07a',
  heal: '#7cff8a', frost: '#9fd8ff', shadow: '#c27bff', arrow: '#e8d8b0', flame: '#ff9a2e', ember: '#ffe066',
  blood: '#a3201a', dust: '#b4a27c', fur: '#6e4229', cream: '#f4ecd2', gold: '#ffd75a', ghost: '#bfe8ff',
  hpHi: '#e2483a', hpLo: '#7a1d16', hpBg: '#2a1310',
};

// ------------------------------------------------------------------------------------------------ font

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010',
  '?': '110001010000010', ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
  "'": '010010000000000', '"': '101101000000000', '(': '001010010010001', ')': '100010010010100', '*': '000101010101000',
  '%': '101001010100101', '#': '101111101111101', '<': '001010100010001', '>': '100010001010100', '=': '000111000111000',
  '[': '011010010010011', ']': '110010010010110', '_': '000000000000111',
};
const GLYPH_BITS = {};
for (const k in GLYPHS) GLYPH_BITS[k] = [...GLYPHS[k]].map(Number);

export function textWidth(s, scale = 1) { return s.length ? (s.length * 4 - 1) * scale : 0; }

// draws at integer pixels; align 'left' | 'center' | 'right'; shadow draws a 1px ink drop shadow
export function drawText(ctx, s, x, y, col, { scale = 1, align = 'left', shadow = true, alpha = 1 } = {}) {
  s = String(s).toUpperCase();
  const w = textWidth(s, scale);
  let x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const y0 = Math.round(y);
  ctx.globalAlpha = alpha;
  const pass = (dx, dy, c) => {
    ctx.fillStyle = c;
    for (let i = 0; i < s.length; i++) {
      const bits = GLYPH_BITS[s[i]] || GLYPH_BITS['?'];
      const gx = x0 + i * 4 * scale + dx;
      for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 3; c2++) if (bits[r * 3 + c2]) ctx.fillRect(gx + c2 * scale, y0 + r * scale + dy, scale, scale);
    }
  };
  if (shadow) { pass(0, scale, PAL.ink); pass(scale, scale, PAL.ink); }
  pass(0, 0, PAL[col] || col);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ icons

export const ICONS = {
  swipe: ['#..#..#.', '.#..#..#', '.#..#..#', '..#..#..', '..#..#..', '...#..#.', '...#..#.', '........'],
  stomp: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#.####.#', '#..##..#', '.#....#.', '..####..'],
  breath: ['...#....', '..##....', '..###.#.', '.####.#.', '.######.', '########', '.######.', '..####..'],
  roar: ['#....#..', '##....#.', '###.#..#', '####.#.#', '###.#..#', '##....#.', '#....#..', '........'],
  shake: ['........', '#...#...', '.#.#.#.#', '..#...#.', '........', '#...#...', '.#.#.#.#', '..#...#.'],
};

// ------------------------------------------------------------------------------------------------ boss sprites

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export { hash };

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return [Math.hypot(px - (ax + dx * t), py - (ay + dy * t)), t];
}

const HORN = [[7.5, 3.8], [9.5, 6.8], [12.5, 8.8], [16, 9.2], [18.4, 7.6]];

// what the boss is made of at a boss-local point (x toward the head, y to its right)
function material(lx, ly, frame, mouth) {
  const s = ly < 0 ? -1 : 1, ay = Math.abs(ly);
  // horns
  for (let i = 0; i < HORN.length - 1; i++) {
    const [d, t] = distSeg(lx, ay, HORN[i][0], HORN[i][1], HORN[i + 1][0], HORN[i + 1][1]);
    const r = 1.9 - (i + t) * 0.28;
    if (d < r) return i === 3 ? 'hornD' : 'horn';
  }
  if (Math.hypot(lx - 10.6, ay - 2.7) < 1.05) return 'eye';
  if (mouth && lx > 13.2 && lx < 17 && ay < 1.6) return 'mouth';
  if (Math.hypot(lx - 15.1, ay - 1.1) < 0.65) return 'nostril';
  if (Math.hypot(lx - 13.6, ly) < 2.9) return 'snout';
  if (Math.hypot(lx - 9, ly) < 5.7) return 'head';
  // body: a shaggy ellipse
  const bx = lx + 2, ang = Math.atan2(ly, bx);
  const j = (hash(Math.round((ang + 4) * 7), 11) - 0.5) * 2.4;
  if ((bx * bx) / ((12.6 + j) ** 2) + (ly * ly) / ((10.2 + j * 0.8) ** 2) < 1) return 'fur';
  // tail
  const wag = [0, 1, 0, -1][frame] * 1.2;
  if (distSeg(lx, ly, -13, 0, -19, 1.5 + wag)[0] < 2.3 || Math.hypot(lx + 20.5, ly - 2 - wag) < 3) return 'tail';
  // legs, front and back, swinging in diagonal pairs
  const ph = [0, 2.2, 0, -2.2][frame];
  for (const [fx, side, sw] of [[5, 1, 1], [5, -1, -1], [-8, 1, -1], [-8, -1, 1]]) {
    const cx = fx + ph * sw, cy = side * 10.2;
    if (Math.hypot(lx - cx - 2.6, ly - cy - side * 1.4) < 1.15) return 'claw';
    if (Math.hypot(lx - cx, ly - cy) < 3.1) return 'leg';
  }
  return null;
}

export const BOSS_DIRS = 32, BOSS_SIZE = 48;

export function makeBossSprites() {
  const sheet = [];
  const N = BOSS_SIZE, C = N / 2;
  for (let d = 0; d < BOSS_DIRS; d++) {
    const a = d / BOSS_DIRS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    sheet[d] = [];
    for (let m = 0; m < 2; m++) for (let f = 0; f < 4; f++) {
      const mat = new Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const sx = x + 0.5 - C, sy = y + 0.5 - C;
        const lx = sx * ca + sy * sa, ly = -sx * sa + sy * ca;   // rotate back into boss space
        const k = material(lx, ly, f, m === 1);
        mat[y * N + x] = k && { k, lx, ly, sx, sy };
      }
      const cv = newCanvas(N, N), cx = cv.getContext('2d');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const p = mat[y * N + x];
        if (!p) continue;
        const edge = !mat[y * N + x - 1] || !mat[y * N + x + 1] || !mat[(y - 1) * N + x] || !mat[(y + 1) * N + x];
        const bone = p.k === 'horn' || p.k === 'hornD' || p.k === 'claw';
        cx.fillStyle = edge ? (bone ? PAL.hornD : PAL.ink) : shade(p);
        cx.fillRect(x, y, 1, 1);
      }
      sheet[d][m * 4 + f] = cv;
    }
  }
  return sheet;
}

function shade(p) {
  const light = (-p.sx * 0.55 - p.sy * 0.8) / 14;
  const n = hash(Math.round(p.lx * 0.9 + p.ly * 0.35) + 40, Math.round(p.ly * 0.85 - p.lx * 0.12) + 90);
  const furs = ['fur0', 'fur1', 'fur2', 'fur3', 'fur4'];
  let lvl;
  switch (p.k) {
    case 'horn': return PAL.horn;
    case 'hornD': return PAL.hornD;
    case 'eye': return PAL.eye;
    case 'mouth': return PAL.mouth;
    case 'nostril': return PAL.fur0;
    case 'claw': return PAL.horn;
    case 'snout': return light > 0.3 ? PAL.fur4 : PAL.snout;
    case 'leg': return light > 0.2 ? PAL.fur2 : PAL.fur1;
    case 'head': lvl = light > 0.35 ? 3 : light > -0.2 ? 2 : 1; break;
    case 'tail': lvl = light > 0.2 ? 2 : 1; if (p.lx < -18) lvl--; break;
    default: {
      lvl = light > 0.5 ? 3 : light > -0.05 ? 2 : light > -0.55 ? 1 : 0;
      // a dark mane down the spine
      if (p.lx > -12 && p.lx < 3 && Math.abs(p.ly + Math.sin(p.lx * 0.9) * 0.6) < 1.5) lvl = Math.min(lvl, 1) - (n < 0.5 ? 1 : 0);
    }
  }
  if (n < 0.1) lvl--; else if (n > 0.96) lvl++;
  return PAL[furs[Math.max(0, Math.min(4, lvl))]];
}

// a solid-colour silhouette of a sprite, for hit flashes
const tints = new Map();
export function tinted(cv, col) {
  let m = tints.get(cv);
  if (!m) tints.set(cv, m = {});
  if (!m[col]) {
    const t = newCanvas(cv.width, cv.height), c = t.getContext('2d');
    c.drawImage(cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = col;
    c.fillRect(0, 0, t.width, t.height);
    m[col] = t;
  }
  return m[col];
}

export function newCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
