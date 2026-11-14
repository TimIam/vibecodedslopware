// Image segmentation: ornament background removal, currency detection, furniture occluder masks.
function srgb2lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
const LUT = new Float32Array(256).map((_, i) => srgb2lin(i));
export function toLab(data, n) {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  for (let i = 0; i < n; i++) {
    const r = LUT[data[i * 4]], g = LUT[data[i * 4 + 1]], b = LUT[data[i * 4 + 2]];
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    L[i] = 116 * y - 16; A[i] = 500 * (x - y); B[i] = 200 * (y - z);
  }
  return { L, A, B };
}
function kmeans(pts, k, iters = 8) { // pts: array of [L,a,b]
  if (!pts.length) return [[50, 0, 0]];
  const c = []; for (let i = 0; i < k; i++) c.push([...pts[Math.floor((i + 0.5) / k * pts.length)]]);
  for (let it = 0; it < iters; it++) {
    const s = c.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let bi = 0, bd = Infinity; c.forEach((q, j) => { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; bi = j; } }); const t = s[bi]; t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; t[3]++; }
    s.forEach((t, j) => { if (t[3]) c[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  return c;
}
function otsu(vals, max) {
  const bins = 256, hist = new Float64Array(bins); for (const v of vals) hist[Math.min(bins - 1, Math.floor(v / max * (bins - 1)))]++;
  let sum = 0; for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 0, tot = vals.length;
  for (let i = 0; i < bins; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } }
  return (th + 0.5) / (bins - 1) * max;
}
function morph(m, w, h, r, dilate) {
  const out = new Uint8Array(m.length), tmp = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = dilate ? 0 : 1; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= w) continue; if (dilate ? m[y * w + xx] : !m[y * w + xx]) { v = dilate ? 1 : 0; break; } } tmp[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = dilate ? 0 : 1; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; if (dilate ? tmp[yy * w + x] : !tmp[yy * w + x]) { v = dilate ? 1 : 0; break; } } out[y * w + x] = v; }
  return out;
}
export function labelComponents(m, w, h) {
  const lab = new Int32Array(m.length).fill(-1), comps = [], st = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const id = comps.length, c = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0, px: [] };
    st.push(i); lab[i] = id;
    while (st.length) { const j = st.pop(), x = j % w, y = (j / w) | 0; c.area++; c.sx += x; c.sy += y; c.px.push(j); if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const n of [j - 1, j + 1, j - w, j + w]) { if (n < 0 || n >= m.length || lab[n] >= 0 || !m[n]) continue; if ((n === j - 1 && x === 0) || (n === j + 1 && x === w - 1)) continue; lab[n] = id; st.push(n); } }
    c.cx = c.sx / c.area; c.cy = c.sy / c.area; comps.push(c);
  }
  return { lab, comps };
}

// methods: 'lab' | 'chroma' | 'edge' | 'gmm'. thresh scales the Otsu threshold. keepHoles cuts out
// interior background regions (snowflake gaps) instead of filling them.
export function removeBackground(img, { method = 'lab', thresh = 1, keepHoles = false } = {}) {
  const { width: w, height: h, data } = img, n = w * h, { L, A, B } = toLab(data, n);
  // background model from a border band
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03)), samples = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { if (x >= band && x < w - band && y >= band && y < h - band) continue; const i = y * w + x; samples.push([L[i], A[i], B[i]]); }
  let bg = kmeans(samples, 3);
  const lw = method === 'chroma' ? 0.25 : 0.6; // de-weight lightness so soft shadows stay background
  const distTo = (cs, i, wl = lw) => { let d = Infinity; for (const c of cs) { const v = wl * (L[i] - c[0]) ** 2 + (A[i] - c[1]) ** 2 + (B[i] - c[2]) ** 2; if (v < d) d = v; } return Math.sqrt(d); };
  let dist = new Float32Array(n); for (let i = 0; i < n; i++) dist[i] = distTo(bg, i);
  if (method === 'edge') { // add colour-gradient magnitude so faint edges still separate
    const g = new Float32Array(n); let gm = 1e-3;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const gx = L[i + 1] - L[i - 1] + (A[i + 1] - A[i - 1]) * 0.5, gy = L[i + w] - L[i - w] + (A[i + w] - A[i - w]) * 0.5; g[i] = Math.hypot(gx, gy); if (g[i] > gm) gm = g[i]; }
    let dm = 1e-3; for (let i = 0; i < n; i++) if (dist[i] > dm) dm = dist[i];
    for (let i = 0; i < n; i++) dist[i] = dist[i] / dm * 100 + g[i] / gm * 45;
  }
  const sorted = Array.from(dist).sort((a, b) => a - b), max = sorted[Math.floor(n * 0.995)] || 1;
  // threshold: Otsu, but never far above the background's own noise (so pale things like a bill survive next to a bold ornament)
  const bd = []; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { if (x >= band && x < w - band && y >= band && y < h - band) continue; bd.push(dist[y * w + x]); }
  bd.sort((a, b) => a - b); const noise = bd[Math.floor(bd.length * 0.95)] || 2;
  let T = Math.min(otsu(dist, max), noise * 2.5 + 5) * thresh;
  let fg = new Uint8Array(n); for (let i = 0; i < n; i++) fg[i] = dist[i] > T ? 1 : 0;
  if (method === 'gmm') { // re-estimate fg/bg colour models from the first cut
    for (let it = 0; it < 3; it++) {
      const fs = [], bs = []; for (let i = 0; i < n; i += 3) (fg[i] ? fs : bs).push([L[i], A[i], B[i]]);
      if (fs.length < 20) break;
      const fc = kmeans(fs, 4), bc = kmeans(bs, 3);
      for (let i = 0; i < n; i++) fg[i] = distTo(bc, i, 1) > distTo(fc, i, 1) * 1.05 ? 1 : 0;
    }
  }
  fg = morph(morph(fg, w, h, 1, false), w, h, 1, true); // open
  fg = morph(morph(fg, w, h, 2, true), w, h, 2, false); // close
  // flood background from the border
  const bgm = new Uint8Array(n), st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const j = st.pop(); if (bgm[j] || fg[j]) continue; bgm[j] = 1; const x = j % w; if (x > 0) st.push(j - 1); if (x < w - 1) st.push(j + 1); if (j >= w) st.push(j - w); if (j < n - w) st.push(j + w); }
  const solid = new Uint8Array(n); for (let i = 0; i < n; i++) solid[i] = bgm[i] ? 0 : 1;
  const { comps } = labelComponents(solid, w, h);
  const minArea = n * 0.002, big = comps.filter(c => c.area > minArea);
  // Currency first: a bill-shaped piece wins; a coin only counts when something else is in the
  // photo too (a round ornament is coin-shaped), and then it's the smaller round piece.
  let currency = null;
  if (big.length > 1) {
    const cls = big.map(c => classifyCurrency(c, w)).filter(Boolean);
    currency = cls.filter(c => c.kind === 'bill').sort((a, b) => b.conf - a.conf)[0] || null;
    if (!currency) { const coins = cls.filter(c => c.kind === 'coin').sort((a, b) => a.comp.area - b.comp.area); if (coins.length && coins[0].comp.area < Math.max(...big.map(c => c.area)) * 0.8) currency = coins[0]; }
  }
  // the ornament: the biggest, most central piece that isn't the currency
  const score = c => c.area * (1.2 - Math.hypot(c.cx / w - 0.5, c.cy / h - 0.5));
  const rest = big.filter(c => c !== currency?.comp).sort((a, b) => score(b) - score(a));
  const orn = rest[0] || null, others = big.filter(c => c !== orn);
  const mask = new Uint8Array(n);
  if (orn) { for (const j of orn.px) mask[j] = 1; if (keepHoles) for (const j of orn.px) if (!fg[j] && dist[j] < T * 0.8) mask[j] = 0; }
  return { w, h, mask, orn, currency, others };
}

function classifyCurrency(c, w) {
  let best = null;
  const xs = c.px.map(j => j % w), ys = c.px.map(j => (j / w) | 0);
  for (let a = 0; a < 90; a += 2) {
    const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < xs.length; i++) { const u = xs[i] * ca + ys[i] * sa, v = -xs[i] * sa + ys[i] * ca; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const ar = (u1 - u0 + 1) * (v1 - v0 + 1); if (!best || ar < best.ar) best = { ar, a, du: u1 - u0 + 1, dv: v1 - v0 + 1 };
  }
  const long = Math.max(best.du, best.dv), short = Math.min(best.du, best.dv), fill = c.area / best.ar, aspect = long / short;
  if (aspect > 1.9 && aspect < 2.85 && fill > 0.8) return { kind: 'bill', longPx: long, shortPx: short, conf: fill - Math.abs(aspect - 2.35), comp: c };
  if (aspect < 1.18 && fill > 0.68 && fill < 0.9) return { kind: 'coin', diamPx: 2 * Math.sqrt(c.area / Math.PI), conf: 1 - Math.abs(fill - 0.785) * 4, comp: c };
  return null;
}

// Chamfer distance transform inside mask (for the "inflated" model).
export function distanceField(mask, w, h) {
  const d = new Float32Array(w * h); const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) v = Math.min(v, d[i - w] + 1); if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1.414); d[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue; let v = d[i]; if (x < w - 1) v = Math.min(v, d[i + 1] + 1); if (y < h - 1) v = Math.min(v, d[i + w] + 1); if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1.414); d[i] = v; }
  let m = 1; for (const v of d) if (v > m && v < INF) m = v; for (let i = 0; i < d.length; i++) d[i] = Math.min(1, d[i] / m);
  return d;
}

// Furniture occluder mask inside a detection box: colour models from the box centre (furniture)
// versus a ring just outside it (what's behind), classified per pixel, cleaned and feathered.
export function refineMask(img, box) {
  const { width: W, height: H, data } = img;
  let [x0, y0, x1, y1] = box.map(Math.round); x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, canvas = document.createElement('canvas'); canvas.width = Math.max(1, bw); canvas.height = Math.max(1, bh);
  if (bw < 4 || bh < 4) return { canvas, x: x0, y: y0 };
  const pad = Math.round(Math.max(bw, bh) * 0.08), lab = (x, y) => { const i = (y * W + x) * 4; const t = toLab(data.subarray(i, i + 4), 1); return [t.L[0], t.A[0], t.B[0]]; };
  const fgS = [], bgS = [], step = Math.max(2, Math.round(Math.max(bw, bh) / 60));
  for (let y = y0 + bh * 0.3; y < y0 + bh * 0.85; y += step) for (let x = x0 + bw * 0.25; x < x0 + bw * 0.75; x += step) fgS.push(lab(x | 0, y | 0));
  for (let y = Math.max(0, y0 - pad); y <= Math.min(H - 1, y1); y += step) for (const x of [Math.max(0, x0 - pad), Math.max(0, x0 - 2), Math.min(W - 1, x1 + 2), Math.min(W - 1, x1 + pad)]) bgS.push(lab(x, y | 0));
  for (let x = x0; x <= x1; x += step) for (const y of [Math.max(0, y0 - pad), Math.max(0, y0 - 2)]) bgS.push(lab(x, y));
  const fc = kmeans(fgS, 4), bc = kmeans(bgS, 4);
  const sub = new Uint8ClampedArray(bw * bh * 4); for (let y = 0; y < bh; y++) sub.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + bw) * 4), y * bw * 4);
  const { L, A, B } = toLab(sub, bw * bh), d = (cs, i) => { let m = Infinity; for (const c of cs) { const v = (L[i] - c[0]) ** 2 + (A[i] - c[1]) ** 2 + (B[i] - c[2]) ** 2; if (v < m) m = v; } return m; };
  let m = new Uint8Array(bw * bh);
  for (let i = 0; i < m.length; i++) { const y = (i / bw) | 0; m[i] = (d(fc, i) < d(bc, i) * (y > bh * 0.6 ? 1.6 : 1)) ? 1 : 0; } // the lower part is almost always furniture
  m = morph(morph(m, bw, bh, 2, true), bw, bh, 2, false); m = morph(morph(m, bw, bh, 1, false), bw, bh, 1, true);
  const { comps } = labelComponents(m, bw, bh); const keep = new Uint8Array(m.length);
  for (const c of comps) if (c.area > m.length * 0.04 || c.y1 > bh * 0.8) for (const j of c.px) keep[j] = 1;
  const g = canvas.getContext('2d'), out = g.createImageData(bw, bh);
  for (let i = 0; i < keep.length; i++) { out.data[i * 4 + 3] = keep[i] ? 255 : 0; out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255; }
  g.putImageData(out, 0, 0);
  return { canvas, x: x0, y: y0 };
}
