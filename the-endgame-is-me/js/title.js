// The Endgame is Me: the title screen's picture. The logo is cut stone, baked once per pixel, and its four pieces drop
// in with thuds over the boss pacing behind. The raid chat sits in the corner. The menu itself is real buttons (see menu.js).

import { W, H } from './world.js';
import { PAL, drawText, newCanvas } from './art.js';

// ------------------------------------------------------------------------------------------------ noise

const noise = (x, y, s) => {
  let n = Math.imul(x * 374761393 + y * 668265263 + s * 91 | 0, 1274126177);
  n ^= n >>> 13; n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function seeded(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

const GRANITE = ['#2e2d2b', '#4a4946', '#6a6864', '#8b8982', '#aaa79f', '#c8c5bb', '#e4e1d6'].map(rgb);
const FELDSPAR = rgb('#b09488');
const FACE = ['#ff8a35', '#f86a28', '#e64c20', '#c8341c', '#a32417', '#7c1712', '#560e0c'].map(rgb);
const UNDERCUT = rgb('#2a0807');
const INK = rgb('#0e0b0a');
const CRACK = rgb('#120a09');
const BROKEN_RIM = rgb('#ebe7da');
const BROKEN_FACE = rgb('#ffb98a');

// ------------------------------------------------------------------------------------------------ the letter shapes

// Shapes live in a unit box. u runs across, v runs down. Sliced letters keep their bars a set thickness in pixels and
// stretch only the gaps: v 0 to .25 is the top bar, .4 to .6 the middle bar, .75 to 1 the bottom bar.
const box = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

function glyph(ch, s) {
  const stem = box(0, 0, s, 1), right = box(1 - s, 0, 1, 1);
  const top = box(0, 0, 1, .25), low = box(0, .75, 1, 1), mid = box(0, .4, 1, .6);
  const nick = .2; // corner cut
  const tr = [[1 - nick, -.01], [1.01, -.01], [1.01, .13]], br = [[1 - nick, 1.01], [1.01, 1.01], [1.01, .87]];
  const tl = [[nick, -.01], [-.01, -.01], [-.01, .13]], bl = [[nick, 1.01], [-.01, 1.01], [-.01, .87]];
  switch (ch) {
    case 'T': return { add: [top, box(.5 - s / 2, 0, .5 + s / 2, 1)] };
    case 'H': return { add: [stem, right, mid] };
    case 'E': return { add: [stem, top, low, box(0, .4, .86, .6)] };
    case 'I': return { add: [top, low, box(.5 - s / 2, 0, .5 + s / 2, 1)] };
    case 'N': return { linear: true, add: [stem, right, [[0, 0], [s * 1.15, 0], [1, 1], [1 - s * 1.15, 1]]] };
    case 'D': return { add: [stem, top, low, right], cut: [tr, br] };
    case 'G': return { add: [stem, top, low, box(1 - s, .4, 1, 1), box(.55, .4, 1, .6)], cut: [tl, bl, br] };
    case 'A': return { add: [stem, right, top, mid], cut: [tl, tr] };
    case 'M': return { linear: true, add: [stem, right, [[0, 0], [s, 0], [.5, .6], [1 - s, 0], [1, 0], [1, .18], [.5, .86], [0, .18]]] };
    case 'S': return { add: [top, low, mid, box(0, 0, s, .6), box(1 - s, .4, 1, 1), box(1 - s * .9, 0, 1, .33), box(0, .67, s * .9, 1)], cut: [tl, br] };
  }
  return { add: [] };
}

function inPoly(p, u, v) {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ui, vi] = p[i], [uj, vj] = p[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

// pixels down from a letter's top edge, turned into v
function toV(d, h, g, bars) {
  if (g.linear) return d / h;
  const b = clamp(h * bars.b, bars.bMin, bars.bMax), m = clamp(h * bars.m, bars.mMin, bars.mMax), gap = Math.max(.01, (h - 2 * b - m) / 2);
  if (d < b) return d / b * .25;
  if (d < b + gap) return .25 + (d - b) / gap * .15;
  if (d < b + gap + m) return .4 + (d - b - gap) / m * .2;
  if (d < h - b) return .6 + (d - b - gap - m) / gap * .15;
  return .75 + (d - h + b) / b * .25;
}

// ------------------------------------------------------------------------------------------------ layout

const LOGO_H = 64;
const TOP = 4, BASE = 59;         // the straight top line and ME's floor
const H_MIN = 15, H_MAX = 53;     // G and the outer edge of T and S
const ARCH_POW = 2.4;
const X0 = 4;
const LINE = [
  ['THE', [21, 21, 19]],
  ['ENDGAME', [19, 23, 23, 24, 27, 32, 23]],
  ['IS', [21, 27]],
];
const LETTER_GAP = 2, WORD_GAP = 7, STEM = 8;
const BARS = { b: .27, bMin: 4, bMax: 12, m: .17, mMin: 2.6, mMax: 7.5 };
const ME_BARS = { b: .27, bMin: 8, bMax: 10, m: .18, mMin: 5, mMax: 7 };

function layout() {
  // find G first: the arch peaks over it
  let x = X0, apex = 0;
  const placed = [];
  LINE.forEach(([word, widths]) => {
    [...word].forEach((ch, i) => {
      if (ch === 'G') apex = x + widths[i] / 2;
      placed.push({ word, ch, x0: x, w: widths[i] });
      x += widths[i] + LETTER_GAP;
    });
    x += WORD_GAP - LETTER_GAP;
  });
  const right = x - WORD_GAP;
  const height = px => {
    const d = (px - apex) / (px < apex ? apex - X0 : right - apex);
    return H_MIN + (H_MAX - H_MIN) * Math.pow(Math.abs(d), ARCH_POW);
  };
  const arch = px => TOP + height(px);
  const line = placed.map(l => ({ ...l, top: () => TOP, bot: px => arch(px), rim: 0, stem: STEM, bars: BARS }));
  for (const l of line) l.rim = height(l.x0 + l.w / 2) < 25 ? 1 : 2;

  const n = line.find(l => l.ch === 'N'), m = line.find(l => l.ch === 'M' && l.word === 'ENDGAME');
  const meX0 = n.x0 + 2, meX1 = m.x0 + m.w - 2, meW = meX1 - meX0, meGap = 4, mW = Math.round((meW - meGap) * .58);
  const meTop = px => arch(px) + 3, meBot = () => BASE;
  const me = [
    { word: 'ME', ch: 'M', x0: meX0, w: mW, top: meTop, bot: meBot, rim: 2, stem: 19, bars: ME_BARS },
    { word: 'ME', ch: 'E', x0: meX0 + mW + meGap, w: meW - mW - meGap, top: meTop, bot: meBot, rim: 2, stem: 19, bars: ME_BARS },
  ];
  return { line, me, meX0, meX1 };
}

// ------------------------------------------------------------------------------------------------ stone

const idx = (x, y) => y * W + x;

function rasterize(letters) {
  const mask = new Uint8Array(W * LOGO_H), owner = new Int8Array(W * LOGO_H).fill(-1);
  letters.forEach((l, li) => {
    const g = glyph(l.ch, l.stem / l.w);
    for (let x = Math.floor(l.x0); x < l.x0 + l.w; x++) {
      const top = l.top(x + .5), bot = l.bot(x + .5), h = bot - top, u = (x + .5 - l.x0) / l.w;
      for (let y = Math.floor(top); y < Math.ceil(bot) && y < LOGO_H; y++) {
        const d = y + .5 - top;
        if (d < 0 || d >= h) continue;
        const v = toV(d, h, g, l.bars);
        if (!g.add.some(p => inPoly(p, u, v)) || g.cut?.some(p => inPoly(p, u, v))) continue;
        mask[idx(x, y)] = 1; owner[idx(x, y)] = li;
      }
    }
  });
  return { mask, owner };
}

// knock small bites out of the edges
function wear(mask, owner, letters, seed) {
  const r = seeded(seed), edge = [];
  for (let y = 1; y < LOGO_H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W])) edge.push(i);
  }
  for (const i of edge) {
    const l = letters[owner[i]];
    if (l.rim === 1) continue;
    if (r() < .05) mask[i] = 0;
  }
  letters.forEach((l, li) => {
    if (l.rim === 1) return;
    const mine = edge.filter(i => owner[i] === li), bites = 2;
    for (let b = 0; b < bites; b++) {
      const i = mine[Math.floor(r() * mine.length)], cy = Math.floor(i / W), cx = i - cy * W, R = 1 + r() * .8;
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
        if (y >= 0 && y < LOGO_H && Math.hypot(x - cx, y - cy) <= R) mask[idx(x, y)] = 0;
      }
    }
  });
}

// distance from the edge, for each stone pixel
function edgeDistance(mask) {
  const big = 1e6, d = new Float32Array(W * LOGO_H).fill(big), D = Math.SQRT2;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= LOGO_H) ? 0 : d[idx(x, y)];
  for (let i = 0; i < d.length; i++) if (!mask[i]) d[i] = 0;
  for (let y = 0; y < LOGO_H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (mask[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
  }
  for (let y = LOGO_H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = idx(x, y);
    if (mask[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
  }
  return d;
}

function shade(mask, owner, letters) {
  const px = new Uint8ClampedArray(W * LOGO_H * 4), d = edgeDistance(mask);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= LOGO_H) ? 0 : d[idx(x, y)];
  const put = (i, c) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; };
  for (let y = 0; y < LOGO_H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (!mask[i]) {
      let near = false;
      for (let b = -1; b <= 1 && !near; b++) for (let a = -1; a <= 1; a++) {
        const X = x + a, Y = y + b;
        if (X >= 0 && Y >= 0 && X < W && Y < LOGO_H && mask[idx(X, Y)]) { near = true; break; }
      }
      if (near) put(i, INK);
      continue;
    }
    const l = letters[owner[i] < 0 ? 0 : owner[i]], D = d[i];
    const nx = at(x + 1, y) - at(x - 1, y), ny = at(x, y + 1) - at(x, y - 1);
    const lit = (nx + ny) / (Math.abs(nx) + Math.abs(ny) + .001); // above 0: top and left edges
    if (D <= l.rim + .4) {
      const n = noise(x, y, 1), lump = (noise(x >> 2, y >> 2, 2) + noise(x >> 1, y >> 1, 3)) / 2 - .5;
      let lvl = 3.3 + lit * 1.4 + lump + (D < 1.2 && lit > 0 ? .5 : 0);
      if (n < .08) lvl -= 1.5; else if (n > .93) lvl += 1.2;
      if (noise(x, y, 4) < .03) { put(i, FELDSPAR); continue; }
      put(i, GRANITE[clamp(Math.round(lvl), 0, GRANITE.length - 1)]);
    } else {
      const top = l.top(x + .5), bot = l.bot(x + .5), t = clamp((y + .5 - top) / (bot - top), 0, .999);
      const inner = D <= l.rim + 1.4;
      if (inner && lit > .25 && d[i] && l.rim > 1) { put(i, UNDERCUT); continue; }
      const dither = (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 - .5;
      let band = t * FACE.length + dither * .9;
      if (inner && lit < -.25) band -= 1.4;       // far wall catches the light
      const n = noise(x, y, 5);
      if (n < .05) band += 1.6; else if (n > .975) band -= 1.8;
      put(i, FACE[clamp(Math.floor(band), 0, FACE.length - 1)]);
    }
  }
  return { px, d };
}

// a jagged walk, returned as pixels
function walk(r, x, y, ang, len, jag) {
  const out = [];
  for (let i = 0; i < len; i++) {
    ang += (r() - .5) * jag;
    if (r() < .18) ang += (r() < .5 ? -1 : 1) * .9;
    x += Math.cos(ang); y += Math.sin(ang);
    out.push({ x: Math.round(x), y: Math.round(y), i });
  }
  return out;
}

function paintCracks(sh, mask, owner, letters, paths) {
  const { px } = sh, seen = new Uint8Array(W * LOGO_H);
  const set = (i, c) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; };
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < LOGO_H && mask[idx(x, y)];
  for (const { pts, wide } of paths) for (const p of pts) {
    if (inside(p.x, p.y)) { seen[idx(p.x, p.y)] = 1; set(idx(p.x, p.y), CRACK); }
    if (wide && p.i < wide && inside(p.x + 1, p.y)) { seen[idx(p.x + 1, p.y)] = 1; set(idx(p.x + 1, p.y), CRACK); }
  }
  // the broken lip catches light along one side
  for (let y = 0; y < LOGO_H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = idx(x, y);
    if (!seen[i]) continue;
    for (const j of [i + 1, i + W]) {
      if (!mask[j] || seen[j] || noise(j, 0, 9) > .7) continue;
      const l = letters[owner[j]];
      set(j, sh.d[j] <= l.rim + .4 ? BROKEN_RIM : BROKEN_FACE);
    }
  }
}

function hairlines(letters, r) {
  const paths = [];
  for (const l of letters) {
    const h = l.bot(l.x0 + l.w / 2) - l.top(l.x0 + l.w / 2);
    const count = h > 36 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const x = l.x0 + l.w * (.15 + r() * .7), fromTop = r() < .5, y = fromTop ? l.top(x) : l.bot(x) - 1;
      const ang = (fromTop ? 1 : -1) * (Math.PI / 2 + (r() - .5) * 1.1);
      paths.push({ pts: walk(r, x, y, ang, Math.round(clamp(h * .25, 3, 11) + r() * 4), 1.2) });
    }
  }
  return paths;
}

// the same stone, broken: corners gone and big cracks through it
function breakME(mask, letters, r) {
  const seeds = [], chunks = [];
  const [m, e] = letters;
  const corner = (x, y, R) => chunks.push({ x, y, R });
  corner(m.x0 + 1, m.top(m.x0 + 1) + 1, 7);
  corner(m.x0 + m.w - 1, BASE, 6);
  corner(m.x0, BASE, 4);
  corner(e.x0 + e.w, e.top(e.x0 + e.w - 2) + 1, 7);
  corner(e.x0 + e.w, BASE - 1, 7);
  corner(e.x0 + 1, BASE, 4);
  for (const c of chunks) {
    const lobes = Array.from({ length: 12 }, () => .55 + r() * .6);
    for (let y = Math.floor(c.y - c.R * 1.3); y <= c.y + c.R * 1.3; y++) for (let x = Math.floor(c.x - c.R * 1.3); x <= c.x + c.R * 1.3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= LOGO_H) continue;
      const a = Math.atan2(y - c.y, x - c.x), k = Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 12;
      if (Math.hypot(x - c.x, y - c.y) < c.R * lobes[k]) mask[idx(x, y)] = 0;
    }
    seeds.push([c.x, c.y]);
  }
  const paths = [];
  const trunk = (x, y, ang, len) => {
    const pts = walk(r, x, y, ang, len, .95);
    paths.push({ pts, wide: Math.floor(len * .7) });
    seeds.push([x, y]);
    for (let b = 0; b < 2; b++) {
      const p = pts[Math.floor(len * (.25 + r() * .6))];
      if (!p) continue;
      const bAng = ang + (r() < .5 ? -1 : 1) * (.7 + r() * .7);
      const side = walk(r, p.x, p.y, bAng, Math.round(6 + r() * 9), 1.1);
      paths.push({ pts: side, wide: Math.floor(side.length * .3) });
      if (r() < .35 && side.length > 4) {
        const q = side[Math.floor(side.length * .6)];
        paths.push({ pts: walk(r, q.x, q.y, bAng + (r() < .5 ? -1 : 1) * .9, Math.round(4 + r() * 6), 1.1) });
      }
    }
  };
  const down = Math.PI / 2;
  trunk(m.x0 + m.w * .1, m.top(m.x0 + m.w * .1), down + .15, 26);
  trunk(m.x0 + m.w * .5, m.top(m.x0 + m.w * .5) + 14, down - .3, 20);
  trunk(m.x0 + m.w * .86, m.top(m.x0 + m.w * .86), down - .2, 34);
  trunk(m.x0 + m.w * .36, BASE - 1, -down + .4, 16);
  trunk(e.x0 + e.w * .2, e.top(e.x0 + e.w * .2), down + .25, 36);
  trunk(e.x0 + e.w * .78, e.top(e.x0 + e.w * .78), down + .9, 14);
  trunk(e.x0 + e.w * .55, BASE - 1, -down - .5, 15);
  trunk(m.x0 + m.w * .68, BASE - 1, -down + .3, 22);
  trunk(e.x0 + e.w * .1, BASE - 12, -.2, 24);
  dropIslands(mask);
  return { paths, seeds, chunks };
}

// loose crumbs left by a chunk fall away
function dropIslands(mask) {
  const seen = new Uint8Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j >= 0 && j < mask.length && mask[j] && !seen[j]) { seen[j] = 1; q.push(j); }
      }
    }
    if (q.length < 20) for (const i of q) mask[i] = 0;
  }
}

const wordSprite = px => {
  const cv = newCanvas(W, LOGO_H);
  cv.getContext('2d').putImageData(new ImageData(px, W, LOGO_H), 0, 0);
  return cv;
};

function bakeWords() {
  const { line, me, meX0, meX1 } = layout();
  const words = ['THE', 'ENDGAME', 'IS'].map((name, wi) => {
    const letters = line.filter(l => l.word === name), { mask, owner } = rasterize(letters);
    wear(mask, owner, letters, 100 + wi);
    const sh = shade(mask, owner, letters);
    paintCracks(sh, mask, owner, letters, hairlines(letters, seeded(200 + wi)));
    return { name, letters, cv: wordSprite(sh.px), x0: letters[0].x0, x1: letters.at(-1).x0 + letters.at(-1).w, bot: letters[0].bot };
  });

  // ME is baked whole and broken, and the difference is revealed at impact
  const { mask, owner } = rasterize(me);
  wear(mask, owner, me, 300);
  const before = shade(mask, owner, me);
  const r = seeded(777);
  const early = [{ pts: walk(r, me[0].x0 + 14, 40, .5, 12, 1.1) }, { pts: walk(r, me[1].x0 + 10, 34, 1.2, 10, 1.1) }];
  paintCracks(before, mask, owner, me, early);

  const broken = mask.slice();
  const { paths, seeds, chunks } = breakME(broken, me, seeded(778));
  const after = shade(broken, owner, me);
  paintCracks(after, broken, owner, me, [...early, ...paths]);

  const live = new ImageData(before.px.slice(), W, LOGO_H), reveal = [];
  const jitter = seeded(779);
  for (let y = 0; y < LOGO_H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y) * 4, a = before.px, b = after.px;
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
    let near = 1e9;
    for (const [sx, sy] of seeds) near = Math.min(near, Math.hypot(x - sx, y - sy));
    reveal.push({ i, at: .01 + near / 42 * .32 + jitter() * .03 });
  }
  reveal.sort((p, q) => p.at - q.at);
  const cv = newCanvas(W, LOGO_H);
  cv.getContext('2d').putImageData(live, 0, 0);
  return { words, me: { name: 'ME', letters: me, cv, live, final: after.px, reveal, chunks, x0: meX0, x1: meX1, bot: () => BASE, pos: 0 } };
}

// The same cut stone, one line at a time, bent evenly about the line's own middle. The shop's logo shirt uses it
// (tools/shop-designs.mjs); the title screen doesn't. Without flip the letters hang from a flat top with the arch
// underneath, like THE ENDGAME IS. With flip they stand on a flat floor and dip in the middle. A word with
// broken: true is cut chunky like ME and gets its corners knocked off and its cracks. Returns a W × LOGO_H canvas.
export function bakeLine(words, { hMin, hMax, flip = false, wordGap = WORD_GAP }) {
  const letters = [];
  let x = X0;
  words.forEach(({ word, widths, broken, stem = broken ? 19 : STEM, bars = broken ? ME_BARS : BARS, gap = broken ? 4 : LETTER_GAP }, wi) => {
    [...word].forEach((ch, i) => {
      letters.push({ word, wi, ch, x0: x, w: widths[i], stem, bars });
      x += widths[i] + (i < word.length - 1 ? gap : wordGap);
    });
  });
  const right = x - wordGap, mid = (X0 + right) / 2, half = (right - X0) / 2;
  const height = px => hMin + (hMax - hMin) * Math.pow(Math.min(1, Math.abs(px - mid) / half), ARCH_POW);
  for (const l of letters) {
    l.top = flip ? px => BASE - height(px) : () => TOP;
    l.bot = flip ? () => BASE : px => TOP + height(px);
    l.rim = l.stem > STEM || height(l.x0 + l.w / 2) >= 25 ? 2 : 1;
  }
  const out = newCanvas(W, LOGO_H), g = out.getContext('2d');
  words.forEach(({ broken }, wi) => {
    const mine = letters.filter(l => l.wi === wi), { mask, owner } = rasterize(mine);
    wear(mask, owner, mine, 400 + wi);
    let paths = hairlines(mine, seeded(500 + wi));
    if (broken) paths = [...paths, ...breakME(mask, mine, seeded(778)).paths];
    const sh = shade(mask, owner, mine);
    paintCracks(sh, mask, owner, mine, paths);
    g.drawImage(wordSprite(sh.px), 0, 0);
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ timing

const LANDS = { THE: 0.62, IS: 1.14, ENDGAME: 1.66, ME: 2.42 };
const ORDER = ['THE', 'IS', 'ENDGAME', 'ME'];
const FALL = { THE: 0.22, IS: 0.22, ENDGAME: 0.22, ME: 0.26 };
const FALL_FROM = 72;
const HIT = LANDS.ME;
const END = HIT + 0.55;

// a hop and a smaller hop, in pixels up, then still
function settle(s, amp, dur) {
  if (s < 0.03) return -1;
  if (s < dur) return Math.round(amp * Math.sin(Math.PI * s / dur));
  if (s < dur * 1.6 && amp > 1) return Math.round(Math.ceil(amp / 2) * Math.sin(Math.PI * (s - dur) / (dur * .6)));
  return 0;
}

// ------------------------------------------------------------------------------------------------ dust and chips

const DUST = ['#8b8780', '#b5b0a6', '#6d6a64', '#a39e94'];
const DUST_FLOOR = 62;

function makeDust(piece, n, seed, power) {
  const r = seeded(seed), span = piece.x1 - piece.x0, mid = (piece.x0 + piece.x1) / 2, out = [];
  for (let k = 0; k < n; k++) {
    const x = piece.x0 + r() * span;
    out.push({
      x, y: piece.bot(x) + r() * 2,
      vx: (x - mid) / (span / 2) * 26 * power + (r() - .5) * 40 * power,
      vy: -(6 + r() * 16) * power,
      size: 1 + Math.floor(r() * (1.4 + power)),
      life: Math.min(.52, .3 + r() * .28 * Math.sqrt(power)),
      col: DUST[Math.floor(r() * DUST.length)],
    });
  }
  return out;
}

function makeChips(me, seed) {
  const r = seeded(seed), cols = ['#c8c5bb', '#8b8982', '#6a6864', '#e64c20', '#a32417'], out = [];
  for (const c of me.chunks) {
    for (let k = 0; k < 6; k++) {
      out.push({ x: c.x + (r() - .5) * c.R, y: c.y + (r() - .5) * c.R, vx: (r() - .5) * 150, vy: -30 - r() * 110, s: 1 + Math.floor(r() * 3), life: .3 + r() * .2, col: cols[Math.floor(r() * cols.length)] });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ raid chat

const CHANNELS = { L: ['LFG', '#8fd16a'], R: ['RAID', '#ff9a4a'], T: ['TRADE', '#d2cfbd'], G: ['GUILD', '#9fd8ff'] };
// every line has to fit the panel beside its channel name: 18 characters at most
const CHAT = [
  ['L', 'NEED TANK + HEALER'], ['R', 'WAIT FOR THE TIMER'], ['R', 'HE IS JUST WALKING'], ['R', 'WHY IS HE WALKING'],
  ['G', 'GUIDE SAYS ROCK'], ['R', 'WHICH ROCK'], ['R', 'THE OTHER ROCK'], ['L', 'MUST HAVE CLEARED'],
  ['T', 'WTS BOSS FUR, USED'], ['R', 'HEALER IS AFK'], ['R', 'WHY YELL YOUR NAME'], ['R', 'WHO IS HORSE GUY'],
  ['G', 'WHO INVITED HORSE'], ['L', 'NEED 40 MORE. PLS'], ['T', 'WTB NEW RAID'], ['R', 'HE LOOKED AT ME'],
];
const CHAT_X = 6, CHAT_Y = 131, CHAT_W = 102, CHAT_ROWS = 5;

// ------------------------------------------------------------------------------------------------ the screen

export function createTitle({ instant = false, onThud = () => {} } = {}) {
  const { words, me } = bakeWords();
  const pieces = { THE: words[0], ENDGAME: words[1], IS: words[2], ME: me };
  const dust = {
    THE: makeDust(words[0], 28, 11, .8), IS: makeDust(words[2], 22, 12, .8),
    ENDGAME: makeDust(words[1], 52, 13, .9), ME: makeDust(me, 100, 14, 1.7),
  };
  const chips = makeChips(me, 15);
  const landed = { THE: instant, IS: instant, ENDGAME: instant, ME: instant };
  let order = shuffled(), next = 0, lines = [], chatT = 0;
  function shuffled() { return CHAT.map(l => [Math.random(), l]).sort((a, b) => a[0] - b[0]).map(p => p[1]); }

  // spread ME's cracks up to this moment after impact
  function breakTo(since) {
    let moved = false;
    while (me.pos < me.reveal.length && me.reveal[me.pos].at <= since) {
      const { i } = me.reveal[me.pos++];
      for (let k = 0; k < 4; k++) me.live.data[i + k] = me.final[i + k];
      moved = true;
    }
    if (moved) me.cv.getContext('2d').putImageData(me.live, 0, 0);
  }
  if (instant) breakTo(Infinity);

  const self = {
    t: instant ? END + 1 : 0,
    calm: false,
    get done() { return self.t >= END; },
    skip() {
      if (self.t >= END) return;
      const boom = !landed.ME;
      for (const w of ORDER) landed[w] = true;
      self.t = END;
      breakTo(Infinity);
      if (boom) onThud('titleBoom');
    },
    update(dt) {
      self.t += dt;
      for (const w of ORDER) {
        if (landed[w] || self.t < LANDS[w]) continue;
        landed[w] = true;
        onThud(w === 'ME' ? 'titleBoom' : 'titleThud');
      }
      if (self.t < END) return;
      chatT -= dt;
      if (chatT <= 0) {
        lines.push({ ...{ m: order[next % order.length] }, age: 0 });
        if (lines.length > CHAT_ROWS) lines.shift();
        next++;
        if (next >= order.length) { order = shuffled(); next = 0; }
        chatT = 1.6 + Math.random() * 1.6;
      }
      for (const l of lines) l.age += dt;
    },
    draw(c) {
      const t = self.t, since = t - HIT;
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (since >= 0) breakTo(since);

      // screen kick: the whole buffer moves, background included
      let ox = 0, oy = 0;
      if (!self.calm) {
        for (const w of ORDER) {
          const s = t - LANDS[w];
          if (w === 'ME') {
            if (s >= 0 && s < .5) {
              const a = 6 * Math.pow(1 - s / .5, 1.4);
              ox += Math.round(Math.sin(s * 71) * a); oy += Math.round(Math.cos(s * 57) * a);
            }
          } else if (s >= 0 && s < .13) oy += s < .05 ? 2 : 1;
        }
      }
      if ((ox || oy) && c.canvas) c.drawImage(c.canvas, ox, oy);

      // the arch jumps when ME lands
      const shock = since >= 0 && since < .2 ? -Math.round(2 * Math.sin(Math.PI * since / .2)) : 0;
      for (const w of ORDER) {
        const land = LANDS[w], start = land - FALL[w];
        if (t < start) continue;
        const s = t - land;
        let y;
        if (s < 0) { const e = (t - start) / FALL[w]; y = -Math.round((1 - e * e) * FALL_FROM); }
        else y = -settle(s, w === 'ME' ? 3 : 2, w === 'ME' ? .13 : .1) + (w === 'ME' ? 0 : shock);
        c.drawImage(pieces[w].cv, ox, y + oy);
      }

      for (const w of ORDER) {
        const s = t - LANDS[w];
        if (s < 0) continue;
        for (const d of dust[w]) {
          if (s > d.life) continue;
          const k = s / d.life;
          const x = d.x + d.vx * s * (1 - k * .5), y = d.y + d.vy * s * (1 - k * .55) + 30 * s * s;
          const size = d.size + (k > .6 ? 1 : 0);
          if (y + size > DUST_FLOOR + 1) continue;
          c.globalAlpha = k < .5 ? .85 : k < .8 ? .5 : .25;
          c.fillStyle = d.col;
          c.fillRect(Math.round(x + ox), Math.round(y + oy), size, size);
        }
      }
      if (since >= 0) for (const f of chips) {
        if (since > f.life) continue;
        c.globalAlpha = since > f.life * .75 ? .5 : 1;
        c.fillStyle = f.col;
        c.fillRect(Math.round(f.x + f.vx * since + ox), Math.round(f.y + f.vy * since + 330 * since * since + oy), f.s, f.s);
      }
      c.globalAlpha = 1;

      if (t >= END) drawChat(c);
      if (t < 0.4) { c.globalAlpha = 1 - t / 0.4; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    },
  };

  function drawChat(c) {
    c.globalAlpha = 0.55; c.fillStyle = '#0a0806'; c.fillRect(CHAT_X, CHAT_Y, CHAT_W, CHAT_ROWS * 8 + 4); c.globalAlpha = 1;
    lines.forEach((l, i) => {
      const [ch, text] = l.m, [name, col] = CHANNELS[ch], y = CHAT_Y + 3 + (i + CHAT_ROWS - lines.length) * 8;
      drawText(c, name, CHAT_X + 3, y, col, { shadow: false });
      drawText(c, text.slice(0, Math.floor(l.age * 45)), CHAT_X + 3 + name.length * 4 + 2, y, PAL.cream, { shadow: false });
    });
  }
  return self;
}
