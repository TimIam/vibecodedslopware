// Pixel art made in code. Everything is drawn at 256x224 (SNES resolution) with hard edges,
// a fixed palette, ordered dithering for gradients and 1px dark outlines on sprites.

export const W = 256, H = 224;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // Small art canvases get read back (outlines, rim light), so ask for a CPU-side buffer.
  const g = c.getContext('2d', w * h <= 20000 ? { willReadFrequently: true } : undefined);
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// The palette. Dusk over a 1939 world's fair that never stopped: violets, neon, brass.
export const P = {
  ink: '#0b0a14', deep: '#17142b', navy: '#221f4a', indigo: '#352f73', violet: '#5a3f9e', purple: '#8a4fc0',
  magenta: '#d94fa8', pink: '#ff8fc7', red: '#d8343f', blood: '#7a1426', orange: '#f2873a', amber: '#ffc04d',
  cream: '#fff1c9', white: '#fdfcf5', teal: '#1d6f7a', cyan: '#3fd0d8', ice: '#a8f4f0', green: '#3fae5a',
  lime: '#a6e34d', forest: '#1f5a3a', s0: '#1e2030', s1: '#383c55', s2: '#646b8a', s3: '#a3abc8', s4: '#dfe4f2',
  brown0: '#2b1710', brown1: '#4e2c1c', brown2: '#7a4a2c', brown3: '#a8703f', tan: '#d9a66b',
  gold0: '#5a3c0e', gold1: '#9c6a17', gold2: '#e0a92e', gold3: '#ffe9a0',
};

// Shading ramps, darkest first.
export const RAMP = {
  steel: [P.s0, P.s1, P.s2, P.s3, P.s4],
  gold: [P.gold0, P.gold1, P.gold2, P.gold3, P.white],
  violet: [P.deep, P.navy, P.indigo, P.violet, P.purple],
  neon: [P.navy, P.violet, P.magenta, P.pink, P.white],
  fire: [P.blood, P.red, P.orange, P.amber, P.cream],
  sea: [P.deep, P.teal, P.cyan, P.ice, P.white],
  leaf: [P.ink, P.forest, P.green, P.lime, P.cream],
  skinD: ['#1e110b', '#3b2216', '#5e3822', '#8a5634', '#b07a4e'],
  skinM: ['#2a170e', '#5a3420', '#8f5a36', '#c48a5a', '#e8b788'],
  skinL: ['#3a2418', '#7a4c34', '#c58c66', '#efc29a', '#ffe3c6'],
  cloth: [P.ink, P.deep, P.navy, P.indigo, P.violet],
  red: ['#2a0610', P.blood, P.red, '#ff6a5e', P.pink],
  green: [P.ink, P.forest, P.green, P.lime, P.cream],
};

export function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgb(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }

// 4x4 Bayer matrix: the classic 16-bit dither.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function dith(x, y, t) { return BAYER[(y & 3) * 4 + (x & 3)] < t * 16; }
// Pick from a ramp by a 0..1 level with dithered steps.
export function rampAt(ramp, v, x, y) {
  const f = Math.max(0, Math.min(0.9999, v)) * (ramp.length - 1);
  const i = Math.floor(f);
  return ramp[Math.min(ramp.length - 1, i + (dith(x, y, f - i) ? 1 : 0))];
}

export function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function px(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
export function line(g, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 2000; n++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

export function ellipse(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    if (b > a) g.fillRect(a, y, b - a, 1);
  }
}
export function ring(g, cx, cy, r, c, th = 1) {
  g.fillStyle = c;
  const r2o = r * r, r2i = (r - th) * (r - th);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    if (d <= r2o && d > r2i) g.fillRect(x, y, 1, 1);
  }
}

// Scanline polygon fill on pixel centres.
export function poly(g, pts, c) {
  let y0 = 1e9, y1 = -1e9;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  g.fillStyle = c;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const cy = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k]), b = Math.round(xs[k + 1]);
      if (b > a) g.fillRect(a, y, b - a, 1);
    }
  }
}

// A lit sphere/ellipsoid: per-pixel normal against a light, quantised onto a ramp with dither.
// rim: a colour for the back-lit edge (the Tecmo neon rim light).
export function ball(g, cx, cy, rx, ry, ramp, o = {}) {
  const lx = o.lx ?? -0.55, ly = o.ly ?? -0.65, amb = o.amb ?? 0.18, rim = o.rim, rimSide = o.rimSide ?? 1;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    let v = amb + Math.max(0, nx * lx + ny * ly + nz * 0.55) * (1 - amb);
    if (o.clip && !o.clip(x, y)) continue;
    g.fillStyle = rim && d > 0.72 && nx * rimSide > 0.35 ? rim : rampAt(ramp, v, x, y);
    g.fillRect(x, y, 1, 1);
  }
}

// Vertical gradient across a ramp (dithered bands): skies, metal, screens.
export function vgrad(g, x, y, w, h, ramp, flip = false) {
  for (let j = 0; j < h; j++) {
    const v = flip ? 1 - j / Math.max(1, h - 1) : j / Math.max(1, h - 1);
    for (let i = 0; i < w; i++) { g.fillStyle = rampAt(ramp, v, x + i, y + j); g.fillRect(x + i, y + j, 1, 1); }
  }
}
// Full-width dithered gradient band, baked once per (y, h, colours) and blitted after that.
const skyCache = new Map();
export function sky(g, y, h, cols) {
  y = Math.round(y); h = Math.round(h);
  const key = y + ':' + h + ':' + cols.join(',');
  let c = skyCache.get(key);
  if (!c) {
    const [cv, cg] = canvas(W, Math.max(1, h));
    cg.translate(0, -y); skyRows(cg, y, h, cols);
    if (skyCache.size > 200) skyCache.clear();
    skyCache.set(key, c = cv);
  }
  g.drawImage(c, 0, y);
}
function skyRows(g, y, h, cols) {
  for (let j = 0; j < h; j++) {
    const f = j / Math.max(1, h - 1) * (cols.length - 1), i = Math.floor(f), t = f - i;
    const a = cols[Math.min(cols.length - 1, i)], b = cols[Math.min(cols.length - 1, i + 1)];
    for (let x = 0; x < 4; x++) {
      g.fillStyle = dith(x, y + j, t) ? b : a;
      for (let k = x; k < W; k += 4) g.fillRect(k, y + j, 1, 1);
    }
  }
}

export function ditherRect(g, x, y, w, h, c, t) {
  g.fillStyle = c;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (dith(x + i, y + j, t)) g.fillRect(x + i, y + j, 1, 1);
}

// 1px dark outline around every opaque region.
export function outline(c, color = P.ink) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  g.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) g.fillRect(x, y, 1, 1);
  }
  return c;
}

export function flipX(c) {
  const [o, g] = canvas(c.width, c.height);
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return o;
}

// Sprite from string art: one char per pixel, '.' or ' ' transparent, pal maps chars to colours.
// Several frames can share a block when separated by a line holding only '~'.
export function spr(art, pal, o = {}) {
  const frames = art.replace(/^\n+|\s+$/g, '').split(/\n\s*~\s*\n/).map(f => f.split('\n').map(r => r.replace(/^\s+/, '')));
  const out = frames.map(rows => {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const [c, g] = canvas(w + (o.outline ? 2 : 0), h + (o.outline ? 2 : 0));
    const p = o.outline ? 1 : 0;
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch === '.' || ch === ' ') continue; const col = pal[ch]; if (!col) continue; g.fillStyle = col; g.fillRect(x + p, y + p, 1, 1); } });
    if (o.outline) outline(c, o.outline === true ? P.ink : o.outline);
    return c;
  });
  return out.length === 1 && !o.frames ? out[0] : out;
}

// Draw a sprite centred on x with its feet at y.
export function blitFeet(g, s, x, y, flip = false) {
  if (!s) return;
  if (flip) { g.save(); g.translate(Math.round(x), 0); g.scale(-1, 1); g.drawImage(s, Math.round(-s.width / 2), Math.round(y - s.height)); g.restore(); }
  else g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
}
export function blitC(g, s, x, y, flip = false) {
  if (!s) return;
  if (flip) { g.save(); g.translate(Math.round(x), 0); g.scale(-1, 1); g.drawImage(s, Math.round(-s.width / 2), Math.round(y - s.height / 2)); g.restore(); }
  else g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}

// Recolour a sprite to one flat colour (hit flash, silhouettes).
const flatCache = new WeakMap();
export function flat(s, color) {
  let m = flatCache.get(s); if (!m) flatCache.set(s, m = new Map());
  let c = m.get(color);
  if (c) return c;
  const [o, g] = canvas(s.width, s.height);
  g.drawImage(s, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, s.width, s.height);
  m.set(color, o);
  return o;
}

// Integer scale a small canvas (used for big pixel logos).
export function scaleUp(s, k) {
  const [o, g] = canvas(s.width * k, s.height * k);
  g.imageSmoothingEnabled = false; g.drawImage(s, 0, 0, o.width, o.height);
  return o;
}

// Seeded random for art that must look the same every frame.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Bake a painter into a cached canvas once.
const bakes = new Map();
export function bake(key, w, h, paint) {
  let c = bakes.get(key);
  if (!c) { const [cv, g] = canvas(w, h); paint(g, cv); bakes.set(key, c = cv); }
  return c;
}

// Shared scenery -------------------------------------------------------------

// Twinkling starfield. Stars are seeded so they don't swim.
const starSets = new Map();
export function stars(g, t, { n = 70, seed = 3, y0 = 0, y1 = H, drift = 0, cols = [P.s2, P.s3, P.white] } = {}) {
  let s = starSets.get(seed + ':' + n);
  if (!s) { const r = rng(seed); s = Array.from({ length: n }, () => ({ x: r() * 512, y: r(), p: r() * 6.28, k: r() })); starSets.set(seed + ':' + n, s); }
  for (const st of s) {
    const x = ((st.x - drift * (0.3 + st.k)) % W + W) % W, y = y0 + st.y * (y1 - y0);
    const tw = Math.sin(t * (1 + st.k * 3) + st.p);
    const c = cols[Math.min(cols.length - 1, Math.floor((st.k * 0.6 + tw * 0.4 + 0.4) * cols.length))] || cols[0];
    g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1);
    if (st.k > 0.93 && tw > 0.6) { g.fillRect((x | 0) - 1, y | 0, 3, 1); g.fillRect(x | 0, (y | 0) - 1, 1, 3); }
  }
}

// A city skyline silhouette strip, baked per seed. Windows glow in `lit`.
export function skyline(seed, h, body, lit, { tall = 1, spires = true } = {}) {
  return bake(`sky:${seed}:${h}:${body}:${lit}:${tall}`, 512, h, g => {
    const r = rng(seed);
    let x = 0;
    while (x < 512) {
      const w = 10 + (r() * 22 | 0), bh = (h * (0.3 + r() * 0.7) * tall) | 0;
      rect(g, x, h - bh, w, bh, body);
      if (spires && r() < 0.25) rect(g, x + (w >> 1), h - bh - 6 - (r() * 10 | 0), 1, 16, body);
      if (r() < 0.2) { rect(g, x + 2, h - bh - 3, w - 4, 3, body); }
      for (let wy = h - bh + 3; wy < h - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < 0.28) { g.fillStyle = lit; g.fillRect(wx, wy, 1, 2); }
      x += w + (r() * 3 | 0);
    }
  });
}
export function drawStrip(g, strip, scroll, y) {
  const off = ((scroll % 512) + 512) % 512;
  g.drawImage(strip, -Math.round(off), y);
  g.drawImage(strip, 512 - Math.round(off), y);
}

// The Perisphere and Trylon of the 1939 World's Fair: the album cover's landmark,
// drawn as this game's emblem. Baked at a given radius.
export function perisphere(r, ramp = RAMP.steel, rim = P.cyan) {
  return bake(`peri:${r}:${ramp[0]}:${rim}`, r * 2 + 40, r * 3 + 10, g => {
    const cx = r + 20, cy = r * 1.5;
    // Trylon: a tall three-sided spire behind and to the right.
    const tx = cx + r * 0.95, top = 2, base = cy + r * 0.9;
    poly(g, [[tx, top], [tx + r * 0.16, base], [tx - r * 0.16, base]], ramp[1]);
    poly(g, [[tx, top], [tx + r * 0.16, base], [tx + 1, base]], ramp[2]);
    line(g, tx, top, tx, base, ramp[3]);
    ball(g, cx, cy, r, r, ramp, { rim, rimSide: 1 });
    // Helicline ramp curling round the sphere.
    for (let a = 0; a < 3.3; a += 0.01) {
      const x = cx - r * 1.08 * Math.cos(a), y = cy + r * 0.95 - a * r * 0.22;
      if (Math.cos(a) < 0.2 || a > 2.7) { px(g, x, y, ramp[3]); px(g, x, y + 1, ramp[1]); }
    }
    // Stilts.
    for (const k of [-0.5, -0.15, 0.2, 0.55]) rect(g, cx + k * r, cy + r * 0.92, 2, r * 0.32, ramp[1]);
    rect(g, cx - r * 0.8, cy + r * 1.22, r * 1.6, 2, ramp[2]);
  });
}

// Screen shake helper: returns an offset that decays.
export function shakeOff(amount, t) { return amount > 0 ? [Math.round(Math.sin(t * 91) * amount), Math.round(Math.cos(t * 77) * amount)] : [0, 0]; }

// Black letterbox bars + a framed window (the Tecmo cinema look).
export function frame(g, x, y, w, h, c1 = P.s2, c2 = P.ink) {
  rect(g, x - 2, y - 2, w + 4, 1, c1); rect(g, x - 2, y + h + 1, w + 4, 1, c1);
  rect(g, x - 2, y - 2, 1, h + 4, c1); rect(g, x + w + 1, y - 2, 1, h + 4, c1);
  rect(g, x - 1, y - 1, w + 2, 1, c2); rect(g, x - 1, y + h, w + 2, 1, c2);
  rect(g, x - 1, y - 1, 1, h + 2, c2); rect(g, x + w, y - 1, 1, h + 2, c2);
}

// A bevelled UI box.
export function box(g, x, y, w, h, fill = P.deep, edge = P.s2, hi = P.s3) {
  rect(g, x, y, w, h, fill);
  rect(g, x, y, w, 1, hi); rect(g, x, y, 1, h, hi);
  rect(g, x, y + h - 1, w, 1, edge); rect(g, x + w - 1, y, 1, h, edge);
  rect(g, x - 1, y + 1, 1, h - 2, P.ink); rect(g, x + w, y + 1, 1, h - 2, P.ink);
  rect(g, x + 1, y - 1, w - 2, 1, P.ink); rect(g, x + 1, y + h, w - 2, 1, P.ink);
}

// Meter bar.
export function meter(g, x, y, w, h, v, col, back = P.s0) {
  rect(g, x - 1, y - 1, w + 2, h + 2, P.ink);
  rect(g, x, y, w, h, back);
  const f = Math.round(w * Math.max(0, Math.min(1, v)));
  rect(g, x, y, f, h, col);
  if (h > 2) rect(g, x, y, f, 1, mix(col, P.white, 0.45));
}
