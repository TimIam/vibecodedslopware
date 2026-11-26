// tiles.js — paints a level's tile layer once (and again in patches when a cracked wall breaks): autotiled ground
// with depth shading, theme textures, ledges, rails, thorns and surface decoration, all pixel by pixel.
import { T, SOLID, ONEWAY, SPIKE, WATER, BREAK, RAIL, BACK, EMPTY } from './world.js';
import { ramp, hex, hash2, fbm, vnoise, BAYER4 } from './pix.js';

const R = (h, n = 6, s = 1) => ramp(h, n, s);

const THEMES = {
  wood: { fill: R('#6e4629'), deep: R('#3a2218'), top: R('#62b03c'), top2: R('#3f7e2a'), stone: R('#7d7a8a'), accent: R('#c8a04a'), plank: R('#8a5a32'), spike: R('#4a2a48'), back: R('#2a1c22') },
  bog: { fill: R('#4a4030'), deep: R('#221c18'), top: R('#5f9a52'), top2: R('#3c6a3a'), stone: R('#5a6a5a'), accent: R('#a0c060'), plank: R('#5a4a32'), spike: R('#3a3a28'), back: R('#1c201a') },
  mine: { fill: R('#4e4450'), deep: R('#1e1a24'), top: R('#7a6a64'), top2: R('#5a4e4c'), stone: R('#6a6a7a'), accent: R('#ff8a3a'), plank: R('#7a5434'), spike: R('#8a8a96'), back: R('#1e1820') },
  belfry: { fill: R('#5e6078'), deep: R('#24243a'), top: R('#6a7a8a'), top2: R('#4a5568'), stone: R('#7a7a92'), accent: R('#a8b8d0'), plank: R('#6a4a34'), spike: R('#8a8a9a'), back: R('#1e1e2e') },
  village: { fill: R('#6e5e50'), deep: R('#2a2228'), top: R('#e8f0ff'), top2: R('#b0c0e0'), stone: R('#8a7a6a'), accent: R('#f0b050'), plank: R('#7a5434'), spike: R('#8a8a96'), back: R('#221c22') },
  keep: { fill: R('#5a5868'), deep: R('#201e2a'), top: R('#8a889a'), top2: R('#6a687a'), stone: R('#6e6c80'), accent: R('#c84a4a'), plank: R('#6a4a34'), spike: R('#a0a0b0'), back: R('#1c1a24') },
  bonus: { fill: R('#5a3aa0'), deep: R('#24124a'), top: R('#b89aff'), top2: R('#8060d0'), stone: R('#7a5ac0'), accent: R('#ffe080'), plank: R('#8a5ad0'), spike: R('#d0a0ff'), back: R('#1a0e30') },
};
export function themeColors(theme) { return THEMES[theme] || THEMES.wood; }

const solidT = (t) => t === SOLID || t === BREAK;

export function buildTileLayer(g) {
  const m = g.map;
  const c = document.createElement('canvas');
  c.width = m.wpx; c.height = m.hpx;
  const layer = { canvas: c, ctx: c.getContext('2d'), dist: computeDist(g) };
  paintRegion(layer, g, 0, 0, m.cols - 1, m.rows - 1);
  return layer;
}
export function repaint(layer, g) {
  // cheap: recompute distances and repaint everything that changed since last time
  layer.dist = computeDist(g);
  const m = g.map;
  if (!layer.prev) layer.prev = new Uint8Array(m.t);
  let c0 = 1e9, c1 = -1, r0 = 1e9, r1 = -1;
  for (let r = 0; r < m.rows; r++) for (let cc = 0; cc < m.cols; cc++) {
    const i = r * m.cols + cc;
    if (layer.prev[i] !== m.t[i]) { c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
  }
  layer.prev = new Uint8Array(m.t);
  if (c1 < 0) return;
  paintRegion(layer, g, Math.max(0, c0 - 4), Math.max(0, r0 - 4), Math.min(m.cols - 1, c1 + 4), Math.min(m.rows - 1, r1 + 4));
}

function computeDist(g) {
  const m = g.map, d = new Uint8Array(m.cols * m.rows).fill(9);
  const q = [];
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    const i = r * m.cols + c;
    if (!solidT(m.t[i])) { d[i] = 0; continue; }
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const cc = c + dx, rr = r + dy;
      if (cc < 0 || cc >= m.cols) return false;
      if (rr < 0) return true;
      if (rr >= m.rows) return false;
      return !solidT(m.t[rr * m.cols + cc]);
    });
    if (open) { d[i] = 1; q.push(i); }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], c = i % m.cols, r = (i / m.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dx, rr = r + dy;
      if (cc < 0 || rr < 0 || cc >= m.cols || rr >= m.rows) continue;
      const j = rr * m.cols + cc;
      if (d[j] > d[i] + 1 && solidT(m.t[j])) { d[j] = d[i] + 1; if (d[j] < 6) q.push(j); }
    }
  }
  return d;
}

function pick(r, l, x, y) {
  l = l < 0 ? 0 : l > 1 ? 1 : l;
  const n = r.length, v = (1 - l) * (n - 1), i = Math.floor(v), f = v - i;
  return r[Math.min(n - 1, f > BAYER4[(y & 3) * 4 + (x & 3)] ? i + 1 : i)];
}

function paintRegion(layer, g, c0, r0, c1, r1) {
  const m = g.map, th = THEMES[g.def.theme] || THEMES.wood, theme = g.def.theme;
  const X0 = c0 * T, Y0 = r0 * T, w = (c1 - c0 + 1) * T, h = (r1 - r0 + 1) * T;
  const img = layer.ctx.createImageData(w, h);
  const D = img.data;
  const put = (x, y, col, a = 255) => {
    const lx = x - X0, ly = y - Y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
    const i = (ly * w + lx) * 4;
    D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a;
  };
  const empty = (x, y) => { const lx = x - X0, ly = y - Y0; if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false; return D[(ly * w + lx) * 4 + 3] === 0; };
  const tt = (c, r) => {
    if (c < 0 || c >= m.cols) return SOLID;
    if (r < 0) return EMPTY;
    if (r >= m.rows) return solidT(m.t[(m.rows - 1) * m.cols + c]) ? SOLID : EMPTY;
    return m.t[r * m.cols + c];
  };
  const seed = theme.length * 31;

  // pass 1: backdrop + solids
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = tt(c, r);
    if (t === BACK) {
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const px = c * T + x, py = r * T + y;
        const n = fbm(px / 24, py / 24, seed + 3);
        const brick = theme === 'keep' || theme === 'belfry' || theme === 'village' ? mortar(px, py, 16, 8) : 0;
        put(px, py, pick(th.back, 0.55 + n * 0.3 - brick * 0.35, px, py));
      }
      continue;
    }
    if (!solidT(t)) continue;
    const up = solidT(tt(c, r - 1)), dn = solidT(tt(c, r + 1)), lf = solidT(tt(c - 1, r)), rt = solidT(tt(c + 1, r));
    const dist = layer.dist[r * m.cols + c];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const px = c * T + x, py = r * T + y;
      // pixel depth from the nearest open side
      let dp = (dist - 1) * T + 10;
      if (!up) dp = Math.min(dp, Math.max(0, y - FACE_FRONT) + 1);
      if (!dn) dp = Math.min(dp, T - 1 - y);
      if (!lf) dp = Math.min(dp, x);
      if (!rt) dp = Math.min(dp, T - 1 - x);
      if (dist <= 1) {
        // corner rounding against diagonal air
        if (!up && !lf && x + y < 3) continue;
        if (!up && !rt && (T - 1 - x) + y < 3) continue;
        if (!dn && !lf && x + (T - 1 - y) < 2) continue;
        if (!dn && !rt && (T - 1 - x) + (T - 1 - y) < 2) continue;
      }
      let col = material(theme, th, px, py, dp, seed);
      // outline on open edges
      const edge = (!up && y === 0) || (!dn && y === T - 1) || (!lf && x === 0) || (!rt && x === T - 1);
      if (edge && !(!up && y < 5 && hasTop(theme))) col = th.deep[th.deep.length - 1];
      if (t === BREAK) {
        const k = crack(px, py);
        if (k) col = th.deep[th.deep.length - 1];
        else col = col.map((v, i) => Math.min(255, v + (i === 0 ? 10 : 4)));
      }
      if (!up && y >= FACE_FRONT && y < FACE_FRONT + 4) col = col.map((ch) => ch * (0.55 + (y - FACE_FRONT) * 0.11)); // shade under the lip
      put(px, py, col);
    }
    // top surface band
    if (!up) topFace(th, theme, c, r, put, seed, lf, rt);
    // underside drips/roots
    if (!dn && r + 1 < m.rows) underside(th, theme, c, r, put, empty, seed);
  }
  // pass 2: ledges, rails, spikes, decoration
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = tt(c, r);
    if (t === ONEWAY) ledge(th, theme, c, r, put, tt(c - 1, r) === ONEWAY, tt(c + 1, r) === ONEWAY);
    else if (t === RAIL) rail(th, c, r, put, empty, tt);
    else if (t === SPIKE) spikes(th, theme, c, r, put);
    else if (t === EMPTY && solidT(tt(c, r + 1))) decor(th, theme, c, r, put, empty, seed);
  }
  layer.ctx.clearRect(X0, Y0, w, h);
  layer.ctx.putImageData(img, X0, Y0);
}

function hasTop(theme) { return theme !== 'bonus'; }
function mortar(px, py, bw, bh) {
  const row = Math.floor(py / bh);
  const ox = (row % 2) * (bw / 2);
  const mx = (px + ox) % bw, my = py % bh;
  return mx === 0 || my === 0 ? 1 : 0;
}
function crack(px, py) {
  const a = Math.abs(((px * 3 + py * 5) % 23) - 11) < 1 && ((py >> 2) % 3 !== 0);
  const b = Math.abs(((px * 5 - py * 3 + 400) % 29) - 14) < 1 && ((px >> 2) % 2 === 0);
  return a || b;
}

// Sculpted cliff faces: a height field is lit from the upper left (so earth and rock read as relief, the way a
// rendered backdrop does), with stones set into the soil as little domes, then darkened with depth into the hill.
function rockCell(px, py, sx, sy, seed) {
  // nearest jittered cell centre: returns [distance/radius, dx, dy, id] or null
  const cx = Math.floor(px / sx), cy = Math.floor(py / sy);
  let best = null;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, id = hash2(gx, gy, seed);
    if (id < 0.74) continue;
    const ox = (gx + 0.2 + hash2(gx, gy, seed + 1) * 0.6) * sx, oy = (gy + 0.2 + hash2(gx, gy, seed + 2) * 0.6) * sy;
    const r = (0.3 + hash2(gx, gy, seed + 3) * 0.32) * Math.min(sx, sy);
    const dx = (px - ox) / r, dy = (py - oy) / (r * 0.8), d = Math.hypot(dx, dy);
    if (d < 1 && (!best || d < best[0])) best = [d, dx, dy, id];
  }
  return best;
}
const LIGHT = [-0.55, -0.75, 0.38];
function material(theme, th, px, py, dp, seed) {
  const depth = Math.min(1, dp / 46);
  const shadeDepth = (l) => l - depth * 0.5;
  if (theme === 'wood' || theme === 'bog' || theme === 'mine') {
    // relief: soft lumps plus strata
    const h = (x, y) => fbm(x / 11, y / 9, seed, 3) * 1.0 + vnoise(x / 3.2, y / 3, seed + 5) * 0.28 + (theme === 'mine' ? Math.sin(y / 4.5 + fbm(x / 30, y / 30, seed + 8, 2) * 5) * 0.12 : 0);
    const nx = (h(px - 1, py) - h(px + 1, py)) * 2.2, ny = (h(px, py - 1) - h(px, py + 1)) * 2.2;
    const nn = Math.hypot(nx, ny, 1);
    let lam = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / nn;
    let l = 0.42 + lam * 0.55 + (h(px, py) - 0.6) * 0.25;
    const stone = dp > 2 && rockCell(px, py, theme === "mine" ? 15 : 14, theme === "mine" ? 13 : 11, seed + 41);
    if (stone) {
      const [d, dx, dy, id] = stone, nz = Math.sqrt(Math.max(0, 1 - d * d));
      const sl = 0.35 + (dx * LIGHT[0] + dy * LIGHT[1] + nz * 0.7) * 0.5 + (id - 0.7) * 0.4;
      const spec = Math.pow(Math.max(0, dx * -0.4 + dy * -0.6 + nz * 0.7), 12) * 0.35;
      const ring = d > 0.86 ? -0.25 : 0;
      const base = theme === 'mine' && id > 0.93 ? R('#5ad8e8', 6) : th.stone;
      const c = smooth(base, shadeDepth(sl + ring), px, py);
      return c.map((v) => Math.min(255, v + spec * 255));
    }
    if (theme === 'mine') {
      const vein = Math.abs(fbm(px / 26, py / 26, seed + 5, 2) - 0.5) < 0.016;
      if (vein && dp > 4) return smooth(th.accent, 0.75, px, py);
    }
    if (theme === 'wood') {
      // roots threading through the soil, lit like little cylinders
      const rr = Math.sin(px / 9 + vnoise(px / 30, py / 30, seed + 7) * 6) * 9 - (py % 24) + 12;
      if (Math.abs(rr) < 1.1 && dp > 3 && dp < 34) return smooth(th.plank, shadeDepth(0.55 - rr * 0.25), px, py);
    }
    // ambient occlusion in the crevices
    l -= Math.max(0, 0.55 - h(px, py)) * 0.5;
    return smooth(depth > 0.6 ? th.deep : th.fill, depth > 0.6 ? l + 0.25 - depth * 0.2 : shadeDepth(l), px, py);
  }
  if (theme === 'belfry' || theme === 'village' || theme === 'keep') {
    const bw = theme === 'keep' ? 16 : 12, bh = theme === 'keep' ? 8 : 6;
    const row = Math.floor(py / bh), off = (row % 2) * (bw / 2);
    const col = Math.floor((px + off) / bw);
    const lx = (px + off) % bw, ly = py % bh;
    // each brick is a pillow: lit from the upper left, rounded at its edges, mortar sunk in between
    const ex = Math.min(lx, bw - 1 - lx) / 2.2, ey = Math.min(ly, bh - 1 - ly) / 1.6;
    if (lx === 0 || ly === 0) return smooth(th.deep, shadeDepth(0.32), px, py);
    const nx = lx < 2.2 ? -(1 - ex) : bw - 1 - lx < 2.2 ? 1 - ex : 0, ny = ly < 1.6 ? -(1 - ey) : bh - 1 - ly < 1.6 ? 1 - ey : 0;
    const lam = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.hypot(nx, ny, 1);
    const tone = hash2(col, row, seed) * 0.22 - 0.11 + (vnoise(px / 3, py / 3, seed + 4) - 0.5) * 0.12;
    if (theme === 'keep' && hash2(col, row, seed + 3) > 0.9 && vnoise(px / 4, py / 4, seed) > 0.5) return smooth(R('#4a7a4a', 6), shadeDepth(0.3 + lam * 0.5), px, py);
    return smooth(depth > 0.75 ? th.deep : th.fill, shadeDepth(0.25 + lam * 0.62 + tone) + (depth > 0.75 ? 0.3 : 0), px, py);
  }
  // bonus: crystal blocks
  const f = (Math.floor(px / 8) + Math.floor(py / 8)) % 2;
  if (hash2(px, py, 3) > 0.985) return th.accent[0];
  return smooth(th.fill, 0.55 + f * 0.1 - depth * 0.4 + (vnoise(px / 4, py / 4, seed) - 0.5) * 0.2, px, py);
}

// The floor's top face, seen from a little above: it starts BACK px behind the walking line and runs FACE_FRONT px toward
// the camera, so feet land in its middle and the cliff face drops away below its lit front lip. Texture rows bunch up
// toward the back (perspective), the far end of each run is inset, and the far edge fades into the fog.
export const FACE_BACK = 9, FACE_FRONT = 9;
const FLOOR = {
  wood: { base: R('#a8804e', 7), alt: R('#62b03c', 6), stone: R('#a8a4ac', 6) },
  bog: { base: R('#5e6a40', 7), alt: R('#3e5a38', 6), stone: R('#8ab0b0', 6) },
  mine: { base: R('#7e7068', 7), alt: R('#5e524c', 6), stone: R('#c0a080', 6) },
  belfry: { base: R('#7a8094', 7), alt: R('#5a6074', 6), stone: R('#8a96a8', 6) },
  village: { base: R('#e6eefa', 7), alt: R('#8a7a6a', 6), stone: R('#c8d8f0', 6) },
  keep: { base: R('#8a8698', 7), alt: R('#6a6678', 6), stone: R('#a8a4b8', 6) },
  bonus: { base: R('#9a7ae0', 7), alt: R('#6a4ac0', 6), stone: R('#ffe0a0', 6) },
};
function smooth(r, l, x, y) {
  l = Math.max(0, Math.min(1, l + (hash2(x, y, 3) - 0.5) * 0.05));
  const n = r.length, v = (1 - l) * (n - 1), i = Math.floor(v), f = v - i, a = r[i], b = r[Math.min(n - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function topFace(th, theme, c, r, put, seed, lf, rt) {
  const F = FLOOR[theme] || FLOOR.wood;
  const y0 = r * T - FACE_BACK, depth = FACE_BACK + FACE_FRONT;
  for (let y = y0; y < r * T + FACE_FRONT; y++) {
    const v = (y - y0) / (depth - 1); // 0 = far edge, 1 = near lip
    const tz = 9 / (0.42 + v);         // perspective depth coordinate
    const inset = Math.round((1 - v) * 4);
    for (let x = 0; x < T; x++) {
      const px = c * T + x;
      if (!lf && x < inset) continue;
      if (!rt && x > T - 1 - inset) continue;
      let col, l = 0.5 + v * 0.18;
      const n = fbm(px / 7, tz * 2.2, seed + 1, 3), n2 = vnoise(px / 2.6, tz * 5, seed + 2);
      switch (theme) {
        case 'wood': {
          const grass = v < 0.2 + n * 0.25 || (v > 0.9 && n2 > 0.55);
          if (grass) col = smooth(F.alt, 0.55 + v * 0.25 + n * 0.2, px, y);
          else if (n2 > 0.84) col = smooth(F.stone, 0.75 + v * 0.1, px, y);
          else col = smooth(F.base, l + (n - 0.5) * 0.35, px, y);
          break;
        }
        case 'bog': {
          const pud = fbm(px / 14, tz * 1.4, seed + 9, 2) > 0.62;
          if (pud) col = smooth(F.stone, 0.45 + v * 0.3 + Math.sin(px / 3 + tz) * 0.05, px, y);
          else col = smooth(v < 0.25 + n * 0.2 ? F.alt : F.base, l + (n - 0.5) * 0.4, px, y);
          break;
        }
        case 'mine': col = smooth(n2 > 0.78 ? F.stone : F.base, l + (n2 - 0.5) * 0.5, px, y); break;
        case 'village': {
          const thin = n > 0.62 && v > 0.3;
          col = smooth(thin ? F.alt : F.base, thin ? 0.55 + v * 0.2 : 0.72 + v * 0.22 + (n - 0.5) * 0.12, px, y);
          if (!thin && n2 > 0.93) col = [255, 255, 255];
          break;
        }
        case 'belfry': case 'keep': {
          const row = Math.floor(tz / 1.1), off = (row % 2) * 9;
          const joint = Math.abs(tz / 1.1 - Math.round(tz / 1.1)) < 0.06 * (0.6 + v) || (px + off) % 18 === 0;
          const tone = hash2(Math.floor((px + off) / 18), row, seed) * 0.16;
          col = joint ? smooth(F.alt, 0.3 + v * 0.1, px, y) : smooth(F.base, l + tone + (n - 0.5) * 0.15, px, y);
          if (theme === 'keep' && !joint && v > 0.35 && n2 > 0.9) col = smooth(F.stone, 0.95, px, y); // a glint off the polish
          break;
        }
        default: {
          const gl = (Math.floor(tz) + Math.floor(px / 12)) % 2;
          col = smooth(F.base, l + gl * 0.1 + (n - 0.5) * 0.2, px, y);
          if (n2 > 0.95) col = smooth(F.stone, 1, px, y);
        }
      }
      // far edge sinks into the fog, near lip catches the light
      if (v < 0.12) col = col.map((ch, i) => ch * 0.78 + [30, 26, 44][i] * 0.22);
      if (y >= r * T + FACE_FRONT - 2) col = col.map((ch) => Math.min(255, ch * (y === r * T + FACE_FRONT - 1 ? 0.62 : 1.16)));
      if ((!lf && x === inset) || (!rt && x === T - 1 - inset)) col = col.map((ch) => ch * 0.7);
      put(px, y, col.map(Math.round));
    }
  }
  // fringe on the far edge and the front lip
  for (let x = 0; x < T; x++) {
    const px = c * T + x;
    if ((!lf && x < 4) || (!rt && x > T - 5)) continue;
    const h = hash2(px, r, seed + 11);
    if (theme === 'wood' || theme === 'bog') {
      const hgt = h > 0.45 ? 1 + Math.floor(h * 3) : 0;
      for (let k = 1; k <= hgt; k++) put(px, y0 - k, smooth(th.top, 0.9 - k * 0.1, px, y0 - k).map(Math.round));
      if (hash2(px, r, 19) > 0.6) put(px, r * T + FACE_FRONT, smooth(th.top2, 0.45, px, r).map(Math.round));
    } else if (theme === 'village') {
      const s = Math.round(Math.sin(px / 3.1 + hash2(c, r, 4) * 6) * 1.1 + 1.1);
      for (let k = 1; k <= s; k++) put(px, y0 - k, smooth(R('#e6eefa', 6), 0.85, px, y0 - k).map(Math.round));
      if (h > 0.82) for (let k = 0; k < 3; k++) put(px, r * T + FACE_FRONT + k, smooth(R('#d0e8ff', 6), 0.9 - k * 0.15, px, k).map(Math.round));
    }
  }
}

function topBand(th, theme, c, r, put, seed, lf, rt) {
  for (let x = 0; x < T; x++) {
    const px = c * T + x, py0 = r * T;
    if ((!lf && x < 1) || (!rt && x > T - 2)) continue;
    const jag = Math.floor(hash2(px, r, seed + 5) * 2.4) + (theme === 'village' ? 3 : theme === 'keep' || theme === 'belfry' ? 2 : 3);
    for (let y = 0; y <= jag; y++) {
      const py = py0 + y;
      let col;
      if (y === jag) col = theme === 'village' ? th.top2[4] : th.top2[3];
      else col = pick(y < 1 ? th.top : y < 2 ? th.top : th.top2, 0.9 - y * 0.16 + (hash2(px, py, 9) - 0.5) * 0.15, px, py);
      put(px, py, col);
    }
    // overhang above the surface: tufts / snow lumps
    if (theme === 'wood' || theme === 'bog') {
      const hgt = hash2(px, r, seed + 11) > 0.55 ? Math.floor(hash2(px, r, seed + 12) * 3) + 1 : 0;
      for (let y = 1; y <= hgt; y++) put(px, py0 - y, pick(th.top, 0.95 - y * 0.12, px, py0 - y));
      if (hgt) put(px, py0 - hgt - 1, th.top2[5]);
      else put(px, py0 - 1, th.top2[5]);
    } else if (theme === 'village') {
      const s = Math.sin(px / 3.1 + hash2(c, r, 4) * 6) * 1.2 + 1.2;
      for (let y = 1; y <= Math.round(s); y++) put(px, py0 - y, pick(th.top, 1 - y * 0.08, px, py0 - y));
      put(px, py0 - Math.round(s) - 1, th.top2[4]);
    } else {
      put(px, py0 - 1, th.deep[5]);
    }
  }
}

function underside(th, theme, c, r, put, empty, seed) {
  const by = (r + 1) * T;
  for (let x = 0; x < T; x++) {
    const px = c * T + x;
    const hsh = hash2(px, r, seed + 21);
    if (theme === 'wood' && hsh > 0.8) { const L = 2 + Math.floor(hash2(px, r, 23) * 7); for (let y = 0; y < L; y++) put(px + (y > 3 && hsh > 0.9 ? 1 : 0), by + y, pick(th.deep, 0.55 - y * 0.04, px, by + y)); }
    else if (theme === 'bog' && hsh > 0.72) { const L = 1 + Math.floor(hash2(px, r, 23) * 5); for (let y = 0; y < L; y++) put(px, by + y, pick(th.top2, 0.6 - y * 0.06, px, by + y)); }
    else if (theme === 'mine' && hsh > 0.86) { const L = 2 + Math.floor(hash2(px, r, 23) * 4); for (let y = 0; y < L - Math.abs(x - 8) / 4; y++) put(px, by + y, pick(th.fill, 0.5 - y * 0.08, px, by + y)); }
    else if (theme === 'village' && hsh > 0.9) { for (let y = 0; y < 4; y++) put(px, by + y, pick(R('#d0e8ff'), 0.95 - y * 0.15, px, by + y)); }
    else put(px, by, th.deep[5]);
  }
}

function ledge(th, theme, c, r, put, joinL, joinR) {
  const x0 = c * T, y0 = r * T;
  for (let y = y0 - 4; y < y0; y++) {
    const v = (y - (y0 - 4)) / 4, inset = Math.round((1 - v) * 3);
    for (let x = 0; x < T; x++) {
      if ((!joinL && x < inset) || (!joinR && x > T - 1 - inset)) continue;
      const base = theme === "village" ? R("#e6eefa", 6) : theme === "wood" || theme === "bog" ? th.top2 : th.plank;
      put(x0 + x, y, smooth(base, 0.45 + v * 0.35, x0 + x, y).map(Math.round));
    }
  }
  if (theme === 'wood' || theme === 'bog') {
    // a mossy branch / rotten log
    for (let x = 0; x < T; x++) for (let y = 0; y < 6; y++) {
      const px = x0 + x, py = y0 + y;
      if (!joinL && x < 1 && (y < 1 || y > 4)) continue;
      if (!joinR && x > 14 && (y < 1 || y > 4)) continue;
      const bark = (px * 3 + Math.floor(y * 1.7)) % 7 === 0;
      let col = pick(th.plank, 0.85 - y * 0.12 - (bark ? 0.25 : 0), px, py);
      if (y === 0) col = pick(th.top, 0.85, px, py);
      if (y === 5 || (!joinL && x === 0) || (!joinR && x === 15)) col = th.deep[5];
      put(px, py, col);
    }
    if (!joinR) for (let y = 1; y < 5; y++) put(x0 + 15, y0 + y, th.plank[1]);
    if (theme === 'wood' && hash2(c, r, 3) > 0.6) { put(x0 + 6, y0 - 1, th.top[1]); put(x0 + 7, y0 - 2, th.top[0]); put(x0 + 8, y0 - 1, th.top[2]); }
  } else if (theme === 'keep' || theme === 'belfry' && false) {
    for (let x = 0; x < T; x++) for (let y = 0; y < 7; y++) {
      const px = x0 + x, py = y0 + y;
      let col = pick(th.top, 0.9 - y * 0.13, px, py);
      if (y === 6 || (!joinL && x === 0) || (!joinR && x === 15)) col = th.deep[5];
      put(px, py, col);
    }
  } else {
    // planks on brackets
    for (let x = 0; x < T; x++) for (let y = 0; y < 5; y++) {
      const px = x0 + x, py = y0 + y;
      let col = pick(th.plank, 0.9 - y * 0.14, px, py);
      if (x % 8 === 0) col = th.plank[4];
      if (y === 4 || (!joinL && x === 0) || (!joinR && x === 15)) col = th.deep[5];
      if (theme === 'village' && y === 0) col = pick(R('#e8f0ff'), 0.95, px, py);
      put(px, py, col);
    }
    for (const bx of [3, 12]) { put(x0 + bx, y0 + 2, R('#cfcfd8')[1]); }
    if (!joinL || !joinR) {
      const bx = !joinL ? 2 : 13;
      for (let y = 5; y < 9; y++) put(x0 + bx + (y - 5) * (!joinL ? 0 : 0), y0 + y, th.plank[3 + (y > 6 ? 1 : 0)]);
    }
  }
}

function rail(th, c, r, put, empty, tt) {
  const x0 = c * T, y0 = r * T;
  const metal = R('#9aa0b0'), wood = R('#6a4a30');
  // ties
  for (const tx of [2, 10]) for (let y = 2; y < 5; y++) for (let x = 0; x < 4; x++) put(x0 + tx + x, y0 + y, pick(wood, 0.8 - (y - 2) * 0.2, x0 + tx + x, y0 + y));
  for (let x = 0; x < T; x++) { put(x0 + x, y0, metal[0]); put(x0 + x, y0 + 1, metal[2]); put(x0 + x, y0 + 2, metal[5]); }
  // trestle down to the ground or off the bottom
  if (c % 3 === 0) {
    for (let y = 5; y < 16 * 6; y++) {
      const rr = r + Math.floor(y / T);
      const t = tt(c, rr);
      if (t === SOLID || t === BREAK) break;
      put(x0 + 7, y0 + y, wood[3]); put(x0 + 8, y0 + y, wood[4]);
      if (y % 16 === 8) for (let x = -6; x <= 6; x++) put(x0 + 7 + x, y0 + y + Math.abs(x) * 0, wood[4]);
    }
  }
}

function spikes(th, theme, c, r, put) {
  const x0 = c * T, y0 = r * T;
  if (theme === 'wood' || theme === 'bog') {
    // bramble: tangled thorny vine
    for (let x = 0; x < T; x++) {
      const yy = 11 + Math.round(Math.sin((x0 + x) / 2.3) * 2);
      for (let y = yy; y < 16; y++) put(x0 + x, y0 + y, pick(th.spike, 0.7 - (y - yy) * 0.1, x0 + x, y0 + y));
      if ((x0 + x) % 4 === 0) { put(x0 + x, y0 + yy - 1, th.spike[1]); put(x0 + x, y0 + yy - 2, th.spike[0]); put(x0 + x + 1, y0 + yy - 3, hex('#e8d8f0')); }
      if ((x0 + x) % 5 === 2) put(x0 + x, y0 + yy - 1, th.spike[2]);
    }
  } else {
    for (let s = 0; s < 4; s++) {
      const bx = x0 + s * 4;
      for (let y = 0; y < 8; y++) {
        const half = Math.floor((y + 1) / 4);
        for (let x = 2 - half; x <= 1 + half; x++) put(bx + x, y0 + 8 + y, pick(th.spike, 0.95 - y * 0.08 - (x > 1 ? 0.3 : 0), bx + x, y0 + 8 + y));
      }
    }
  }
}

function decor(th, theme, c, r, put, empty, seed) {
  const hh = hash2(c, r, seed + 101);
  if (hh < 0.55) return;
  const x0 = c * T + Math.floor(hash2(c, r, 5) * 9) + 2, gy = (r + 1) * T - FACE_BACK + 2;
  const kind = Math.floor(hash2(c, r, seed + 7) * 4);
  const set = (x, y, col) => { if (empty(x, y)) put(x, y, col); };
  if (theme === 'wood') {
    if (kind === 0) { // toadstool cluster
      for (let y = 0; y < 3; y++) set(x0, gy - y - 2, hex('#ece0c8'));
      for (let x = -2; x <= 2; x++) set(x0 + x, gy - 5 - (Math.abs(x) === 2 ? 0 : 1), x % 2 ? hex('#d83a3a') : hex('#f05a4a'));
      set(x0, gy - 7, hex('#f05a4a')); set(x0 - 1, gy - 6, hex('#fff0e0'));
    } else if (kind === 1) { // flowers
      for (let i = 0; i < 3; i++) { const fx = x0 + i * 3 - 3, fh = 3 + (i % 2) * 2; for (let y = 0; y < fh; y++) set(fx, gy - 2 - y, th.top2[2]); set(fx, gy - 3 - fh, i === 1 ? hex('#f0d060') : hex('#c88af0')); }
    } else if (kind === 2) { // rock
      for (let y = 0; y < 4; y++) for (let x = -3 + (y === 3 ? 1 : 0); x <= 3 - (y === 3 ? 1 : 0); x++) set(x0 + x, gy - 1 - y, pick(th.stone, 0.8 - y * 0.05 + x * 0.04 * -1, x0 + x, gy - y));
    } else { // tall grass
      for (let i = -3; i <= 3; i++) { const hgt = 3 + Math.floor(hash2(c * 7 + i, r, 3) * 5); for (let y = 0; y < hgt; y++) set(x0 + i + (y > 3 ? Math.sign(i) : 0), gy - 2 - y, pick(th.top, 0.9 - y * 0.1, x0, gy - y)); }
    }
  } else if (theme === 'bog') {
    if (kind < 2) { // cattails
      for (let i = 0; i < 2; i++) { const fx = x0 + i * 4; const hgt = 8 + i * 3; for (let y = 0; y < hgt; y++) set(fx, gy - 2 - y, th.top2[2]); for (let y = 0; y < 3; y++) { set(fx, gy - 2 - hgt - y, hex('#6a3a22')); set(fx + 1, gy - 2 - hgt - y, hex('#4a2818')); } }
    } else if (kind === 2) { for (let y = 0; y < 3; y++) for (let x = -2; x <= 2; x++) set(x0 + x, gy - 1 - y, pick(th.stone, 0.7 - y * 0.06, x0 + x, gy - y)); }
    else for (let i = -3; i <= 3; i++) { const hgt = 2 + Math.floor(hash2(c * 7 + i, r, 3) * 4); for (let y = 0; y < hgt; y++) set(x0 + i, gy - 2 - y, th.top2[1 + (y % 2)]); }
  } else if (theme === 'mine') {
    if (kind === 0) { for (let y = 0; y < 6; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) <= (6 - y) / 3) set(x0 + x, gy - 1 - y, pick(R('#5ad8e8'), 0.95 - y * 0.06 + x * 0.1, x0 + x, gy - y)); }
    else if (kind === 1) for (let y = 0; y < 3; y++) for (let x = -2; x <= 2; x++) set(x0 + x, gy - 1 - y, pick(th.stone, 0.6 - y * 0.08, x0 + x, gy - y));
  } else if (theme === 'village') {
    if (kind === 0) { for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) set(x0 + x, gy - 1 - y, pick(R('#e8f0ff'), 0.95 - Math.abs(x) * 0.1 - y * 0.03, x0 + x, gy - y)); }
  } else if (theme === 'keep') {
    if (kind === 0) { // candle
      for (let y = 0; y < 5; y++) { set(x0, gy - 1 - y, hex('#ece0c8')); set(x0 + 1, gy - 1 - y, hex('#c8b8a0')); }
      set(x0, gy - 7, hex('#ffd060')); set(x0 + 1, gy - 6, hex('#ff8a30'));
    } else if (kind === 1) { for (let y = 0; y < 2; y++) for (let x = -3; x <= 3; x++) set(x0 + x, gy - 1 - y, pick(th.stone, 0.5, x0 + x, gy)); }
  } else if (theme === 'belfry') {
    if (kind === 0) for (let i = -2; i <= 2; i++) { const hgt = 2 + Math.floor(hash2(c * 7 + i, r, 3) * 3); for (let y = 0; y < hgt; y++) set(x0 + i, gy - 2 - y, hex('#5a7a5a')); }
  }
}
