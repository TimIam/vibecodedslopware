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
  heal: '#7cff8a', frost: '#9fd8ff', shadow: '#c27bff', arrow: '#e8d8b0', fireball: '#ff8a1f', flame: '#ff9a2e', ember: '#ffe066',
  blood: '#a3201a', dust: '#b4a27c', fur: '#6e4229', cream: '#f4ecd2', gold: '#ffd75a', ghost: '#bfe8ff',
  splinter: '#c8a070', leaf: '#4e7a32', needle: '#2e5a3a', smoke: '#6b665c', splash: '#9fd0e8',
  hpHi: '#e2483a', hpLo: '#7a1d16', hpBg: '#2a1310', bone: '#e8e2cc', spark: '#bff6ff', beam: '#7fe8ff',
  ice0: '#b8e4f2', ice1: '#dff4fb', ice2: '#8cc8de',
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
  tail: ['..####..', '.#....#.', '#......#', '#...##.#', '#..#..#.', '.#.#....', '..##....', '........'],
  charge: ['........', '#..#....', '.#..#...', '..#..#..', '...#..#.', '..#..#..', '.#..#...', '#..#....'],
  summon: ['#.#..#.#', '###..###', '#.#..#.#', '###..###', '........', '...##...', '..####..', '.#.##.#.'],
  beam: ['.....##.', '....##..', '...##...', '..#####.', '....##..', '...##...', '..##....', '.##.....'],
  ice: ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'],
  haste: ['........', '###.....', '....####', '##......', '...#####', '###.....', '....####', '........'],
  fur: ['.#.#.#..', '#.#.#.#.', '.#####..', '#######.', '#######.', '.#####..', '..###...', '........'],
  lock: ['..###...', '.#...#..', '.#...#..', '#######.', '###.###.', '###.###.', '#######.', '........'],
  empty: ['........', '........', '........', '..####..', '........', '........', '........', '........'],
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
// distance to a polyline, and how far along it (0..1 over its segments)
function distPoly(px, py, pts) {
  let best = Infinity, at = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [d, t] = distSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) { best = d; at = (i + t) / (pts.length - 1); }
  }
  return [best, at];
}

const HORN = [[7.5, 3.8], [9.5, 6.8], [12.5, 8.8], [16, 9.2], [18.4, 7.6]];
const ANTLER = [[[7, 3.5], [4.5, 8.5], [1.5, 12.5]], [[4.5, 8.5], [7.5, 11.5]], [[2.6, 11], [3.6, 14.5]], [[6.2, 5.5], [9.5, 7.2]]];

// What the boss is made of at a boss-local point (x toward the head, y to its right), for one look:
// L = { head, neck, back, tail, limbs }, each 0..4 (see LOOKS in world.js for the names).
function material(lx, ly, frame, mouth, L) {
  const ay = Math.abs(ly);
  const hx = L.neck === 3 ? 4 : 0;   // a long neck pushes the whole head forward
  const X = lx - hx;

  // ---- head ornaments
  if (L.head === 0) {
    for (let i = 0; i < HORN.length - 1; i++) {
      const [d, t] = distSeg(X, ay, HORN[i][0], HORN[i][1], HORN[i + 1][0], HORN[i + 1][1]);
      if (d < 1.9 - (i + t) * 0.28) return i === 3 ? 'hornD' : 'horn';
    }
  } else if (L.head === 1) {
    // ram horns curl round beside the head
    const d = Math.hypot(X - 7, ay - 6.8);
    if (d > 1.3 && d < 3.4) return d < 2.2 ? 'hornD' : 'horn';
  } else if (L.head === 2) {
    for (const br of ANTLER) if (distPoly(X, ay, br)[0] < 0.8) return 'horn';
  }

  // ---- eyes, mouth, snout
  if (L.head === 3) { const d = Math.hypot(X - 11.2, ly); if (d < 0.9) return 'pupil'; if (d < 2.1) return 'eyeWhite'; }
  else if (Math.hypot(X - (L.head === 4 ? 9.4 : 10.6), ay - (L.head === 4 ? 3.1 : 2.7)) < 1.05) return 'eye';
  if (L.head === 4) {
    // a long croc snout with teeth along the edges
    if (X > 10.5 && X < 20.5) {
      const hw = 2.8 - (X - 10.5) * 0.11;
      if (mouth && X > 12 && ay < 1) return 'mouth';
      if (ay < hw) return ay > hw - 0.9 && Math.floor(X) % 2 === 0 ? 'tooth' : 'snoutC';
    }
  } else {
    if (mouth && X > 13.2 && X < 17 && ay < 1.6) return 'mouth';
    if (Math.hypot(X - 15.1, ay - 1.1) < 0.65) return 'nostril';
    if (Math.hypot(X - 13.6, ly) < 2.9) return 'snout';
  }
  if (Math.hypot(X - 9, ly) < (L.head === 3 ? 6.2 : 5.7)) return 'head';

  // ---- neck
  if (L.neck === 3 && lx > 2 && lx < 10 && ay < 3.4) return 'neckFur';
  if (L.neck === 1) {
    const a = Math.atan2(ly, lx - 5);
    if (Math.hypot(lx - 5, ly) < 8.4 + (hash(Math.round((a + 4) * 6), 3) - 0.5) * 2.2) return 'mane';
  }
  if (L.neck === 2) {
    const d = lx - 4.5;
    if (Math.abs(d) < 1.4 && ay < 10.2) return 'leather';
    if (ay >= 10.2 && ay < 12.2 && Math.abs(d) < 1.6 - (ay - 10.2) * 0.75) return 'horn';
    for (const sy of [3, 7]) if (d >= 1.4 && d < 3.4 && Math.abs(ay - sy) < 1.3 - (d - 1.4) * 0.6) return 'horn';
  }
  if (L.neck === 4) {
    const d = Math.hypot(lx - 6.5, ly);
    if (lx < 8.5 && lx > 0 && d > 5 && d < 10.8) return Math.round(Math.atan2(ly, lx - 6.5) * 5) % 2 === 0 ? 'frillD' : 'frill';
  }

  // ---- back, on top of the body
  const bx = lx + 2, ang = Math.atan2(ly, bx);
  const j = (hash(Math.round((ang + 4) * 7), 11) - 0.5) * 2.4;
  const inBody = (bx * bx) / ((12.6 + j) ** 2) + (ly * ly) / ((10.2 + j * 0.8) ** 2) < 1;
  if (L.back === 1) {
    for (let px = -11; px <= 3; px += 3.5) {
      const r = 2.7 - Math.abs(px + 4) * 0.07, e = Math.abs(lx - px) + ay * 1.1;
      if (e < r) return e < r - 1.1 ? 'plateHi' : 'plate';
    }
  } else if (L.back === 2) {
    const e = ((lx + 3) / 10.5) ** 2 + (ly / 8.6) ** 2;
    if (e < 1) {
      const v = ly / 3.3, u = (lx + 3) / 3.8 + (Math.round(v) % 2 ? 0.5 : 0);
      return e > 0.8 || Math.abs(u - Math.round(u)) > 0.4 || Math.abs(v - Math.round(v)) > 0.4 ? 'shellD' : 'shell';
    }
  } else if (L.back === 3) {
    for (const [cx, cy, r] of [[-7, -3, 2.2], [-2, 3.6, 1.9], [-9.5, 4, 1.6], [1, -4, 1.5], [-4, 0, 1.7]]) {
      if (Math.hypot(lx - cx, ly - cy) < r) return hash(Math.round(lx * 2) + 9, Math.round(ly * 2)) > 0.72 ? 'capDot' : 'cap';
    }
    if (inBody && hash(Math.round(lx) + 3, Math.round(ly) + 7) < 0.16) return 'mossy';
  }
  if (inBody) return 'fur';
  if (L.back === 4) {
    // bat wings, spread back and out from the shoulders
    const r = Math.hypot(lx, ay - 4.5), a = Math.atan2(ay - 4.5, lx);
    if (a > 1.5 && a < 3.15 && r < 14) {
      const t = (a - 1.5) / 1.65;
      if (r < 14 - 3 * Math.abs(Math.sin(t * Math.PI * 3))) {
        for (const q of [0, 0.34, 0.67, 1]) if (Math.abs(a - (1.5 + q * 1.65)) * r < 0.7) return 'wingBone';
        return 'wing';
      }
    }
  }

  // ---- tail
  const wag = [0, 1, 0, -1][frame] * 1.2;
  if (L.tail === 0) {
    if (distSeg(lx, ly, -13, 0, -19, 1.5 + wag)[0] < 2.3 || Math.hypot(lx + 20.5, ly - 2 - wag) < 3) return 'tail';
  } else if (L.tail === 1) {
    const cx = -20.4, cy = wag;
    const d = Math.hypot(lx - cx, ly - cy);
    if (d < 3.2) return 'club';
    for (let k = 0; k < 6; k++) { const sa = k * Math.PI / 3; if (distSeg(lx, ly, cx + Math.cos(sa) * 3, cy + Math.sin(sa) * 3, cx + Math.cos(sa) * 4.6, cy + Math.sin(sa) * 4.6)[0] < 0.6) return 'horn'; }
    if (distSeg(lx, ly, -13, 0, -18, wag * 0.8)[0] < 1.6) return 'tail';
  } else if (L.tail === 2) {
    const pts = [[-13, 0], [-16.5, 0.5 + wag], [-19.5, 2.5 + wag], [-21, 6 + wag], [-19.5, 9.5 + wag]];
    if (Math.hypot(lx + 18, ly - 11 - wag) < 1.4) return 'sting';
    const [d, at] = distPoly(lx, ly, pts);
    if (d < 2.3 - at * 0.9) return Math.floor(at * 8) % 2 ? 'tailSeg' : 'tail';
  } else if (L.tail === 3) {
    const pts = [[-13, 0], [-17, -1.5 + wag], [-21, 1 + wag * 1.6], [-23.5, 2.5 + wag * 2]];
    const [d, at] = distPoly(lx, ly, pts);
    if (d < 1.3 - at * 0.5) return at > 0.85 ? 'tailTip' : 'tail';
  } else if (L.tail === 4) {
    const e = ((lx + 18.5) / 6) ** 2 + ((ly - wag) / 3.8) ** 2;
    if (e < 1) return lx < -22.2 ? 'tailWhite' : 'tail';
  }

  // ---- limbs, front and back (and middle), swinging in diagonal pairs
  const ph = [0, 2.2, 0, -2.2][frame];
  const legs = L.limbs === 4 ? [[6, 1, 1], [6, -1, -1], [-1, 1, -1], [-1, -1, 1], [-8, 1, 1], [-8, -1, -1]]
    : [[5, 1, 1], [5, -1, -1], [-8, 1, -1], [-8, -1, 1]];
  for (const [fx, side, sw] of legs) {
    const cx = fx + ph * sw, cy = side * 10.2;
    if (L.limbs === 3) {
      // tentacles that wriggle out sideways
      for (let t = 0; t <= 1; t += 0.1) {
        const tx = fx + ph * sw * 0.4 + Math.sin(t * 3.2 + frame * 1.6 + fx) * 2.4, ty = side * (6.5 + t * 9);
        if (Math.hypot(lx - tx, ly - ty) < 2 - t * 1.2) return hash(Math.round(lx * 2), Math.round(ly * 2)) > 0.8 ? 'tentacleD' : 'tentacle';
      }
      continue;
    }
    if (L.limbs === 1 && Math.hypot(lx - cx - 1.6, ly - cy - side * 1.1) < 1.7) return 'hoof';
    if (L.limbs === 2) {
      const ox = cx + 1.4, oy = cy + side * 1.2;
      for (const [tx, ty] of [[4, -0.2], [3.6, 2.2], [0.8, 3.6]]) if (distSeg(lx, ly, ox, oy, ox + tx, oy + side * ty)[0] < 0.6) return 'talon';
    }
    if ((L.limbs === 0 || L.limbs === 4) && Math.hypot(lx - cx - 2.6, ly - cy - side * 1.4) < 1.15) return 'claw';
    if (Math.hypot(lx - cx, ly - cy) < (L.limbs === 2 ? 2.6 : 3.1)) return 'leg';
  }
  return null;
}

export const BOSS_DIRS = 32, BOSS_SIZE = 56;
const BONE = { horn: PAL.hornD, hornD: PAL.hornD, claw: PAL.hornD, tooth: PAL.hornD, talon: '#a88a3a', plate: '#5f8496', plateHi: '#5f8496' };

// one sprite: a heading, a walk frame, mouth open or shut, for one look
function buildSprite(dir, frame, mouth, L) {
  const N = BOSS_SIZE, C = N / 2;
  const a = dir / BOSS_DIRS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
  const mat = new Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = x + 0.5 - C, sy = y + 0.5 - C;
    const lx = sx * ca + sy * sa, ly = -sx * sa + sy * ca;   // rotate back into boss space
    const k = material(lx, ly, frame, mouth, L);
    mat[y * N + x] = k && { k, lx, ly, sx, sy };
  }
  const cv = newCanvas(N, N), cx = cv.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = mat[y * N + x];
    if (!p) continue;
    const edge = x === 0 || x === N - 1 || !mat[y * N + x - 1] || !mat[y * N + x + 1] || !mat[(y - 1) * N + x] || !mat[(y + 1) * N + x];
    cx.fillStyle = edge ? (BONE[p.k] || PAL.ink) : shade(p);
    cx.fillRect(x, y, 1, 1);
  }
  return cv;
}

// a lazily filled sprite sheet for one look: get(dir, idx) with idx = mouth * 4 + frame
export function makeBossSprites(look) {
  const L = { head: 0, neck: 0, back: 0, tail: 0, limbs: 0, ...look };
  const cache = new Map();
  return {
    key: `${L.head}${L.neck}${L.back}${L.tail}${L.limbs}`,
    get(dir, idx) {
      const k = dir * 8 + idx;
      let s = cache.get(k);
      if (!s) cache.set(k, s = buildSprite(dir, idx & 3, idx >> 2, L));
      return s;
    },
  };
}

function shade(p) {
  const light = (-p.sx * 0.55 - p.sy * 0.8) / 14;
  const n = hash(Math.round(p.lx * 0.9 + p.ly * 0.35) + 40, Math.round(p.ly * 0.85 - p.lx * 0.12) + 90);
  const furs = ['fur0', 'fur1', 'fur2', 'fur3', 'fur4'];
  const two = (hi, lo) => light > 0.15 ? hi : lo;
  let lvl;
  switch (p.k) {
    case 'horn': case 'claw': case 'tooth': return PAL.horn;
    case 'hornD': return PAL.hornD;
    case 'eye': return PAL.eye;
    case 'eyeWhite': return '#f2efe2';
    case 'pupil': return PAL.ink;
    case 'mouth': return PAL.mouth;
    case 'nostril': return PAL.fur0;
    case 'snout': return light > 0.3 ? PAL.fur4 : PAL.snout;
    case 'snoutC': return two(PAL.fur3, PAL.fur2);
    case 'leg': return light > 0.2 ? PAL.fur2 : PAL.fur1;
    case 'leather': return '#3a2618';
    case 'frill': return two('#d8673f', '#c0533a');
    case 'frillD': return '#7e2a18';
    case 'plate': return '#8fb3c4';
    case 'plateHi': return '#c7e3ee';
    case 'shell': return two('#77843f', '#5f6b34');
    case 'shellD': return '#36401c';
    case 'cap': return two('#d0432f', '#a82c20');
    case 'capDot': return '#f2efe2';
    case 'mossy': return PAL.moss;
    case 'wing': return two('#5a3d68', '#432c50');
    case 'wingBone': return '#2a1a33';
    case 'club': return two('#a8977a', '#7e6f56');
    case 'sting': return PAL.red;
    case 'tailSeg': return PAL.fur1;
    case 'tailTip': return PAL.fur0;
    case 'tailWhite': return '#f2efe2';
    case 'hoof': return '#2a2420';
    case 'talon': return '#e8c86a';
    case 'tentacle': return two('#93619f', '#7a4a8a');
    case 'tentacleD': return '#4e2c5a';
    case 'mane': lvl = light > 0.3 ? 2 : light > -0.3 ? 1 : 0; if (n < 0.3) lvl = Math.max(0, lvl - 1); return PAL[furs[lvl]];
    case 'head': case 'neckFur': lvl = light > 0.35 ? 3 : light > -0.2 ? 2 : 1; break;
    case 'tail': lvl = light > 0.2 ? 2 : 1; break;
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
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  // everything offscreen is painted a pixel at a time, which a CPU-backed canvas does far faster than a GPU one
  c.getContext('2d', { willReadFrequently: true });
  return c;
}
