// Procedural textures and noise. Everything is painted on canvases at load; no image files.
import * as THREE from 'three';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const P = new Uint8Array(512);
{
  const r = rng(1337), p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const h3 = (x, y, z) => P[(P[(P[x & 255] + (y & 255)) & 255] + (z & 255)) & 255] / 255;
const fade = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Value noise in [0,1).
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const a = lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v);
  const b = lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v);
  return lerp(a, b, w);
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

function finish(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function canvas(w, h, draw, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, c);
  return finish(c, opts);
}

function pixels(w, h, fn, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, b, a = 255] = fn(x, y);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return { c, g };
}

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Plank flooring / boards. Grain runs along y.
export function wood({ w = 256, h = 512, base = [128, 84, 48], dark = [72, 44, 24], planks = 4, seed = 1, repeat = [1, 1], seams = true } = {}) {
  const pw = w / planks, r = rng(seed), offs = [...Array(planks)].map(() => [r() * 40, r() * h, r()]);
  const { c } = pixels(w, h, (x, y) => {
    const p = Math.min(planks - 1, Math.floor(x / pw)), [ox, joint, tint] = offs[p];
    const lx = x - p * pw;
    const n = fbm3(lx * 0.03 + ox, y * 0.004, seed, 3);
    const ring = 0.5 + 0.5 * Math.sin((lx * 0.11 + n * 9) * 1.7);
    const fine = noise3(lx * 0.9, y * 0.05, ox);
    let t = ring * ring * 0.55 + fine * 0.25 + (tint - 0.5) * 0.3;
    let col = mix3(base, dark, Math.max(0, Math.min(1, t)));
    if (seams) {
      if (lx < 1.5 || lx > pw - 1) col = mix3(col, [20, 12, 6], 0.65);
      const jy = (y - joint + h) % h;
      if (jy < 1.5) col = mix3(col, [20, 12, 6], 0.6);
    }
    return col;
  });
  return finish(c, { repeat });
}

// Victorian wallpaper: stripes with a little repeating sprig.
export function wallpaper({ bg = '#5b3a2e', stripe = '#6a4535', motif = '#c9a46a', repeat = [1, 1] } = {}) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    for (let x = 0; x < w; x += 64) g.fillRect(x + 22, 0, 20, h);
    g.strokeStyle = motif; g.fillStyle = motif; g.lineWidth = 2;
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 4; xx++) {
      const cx = xx * 64 + 32, cy = yy * 128 + (xx % 2 ? 96 : 32);
      g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(cx, cy, 5, 11, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx - 9, cy + 9, 4, 8, -0.8, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx + 9, cy + 9, 4, 8, 0.8, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx, cy + 10); g.lineTo(cx, cy + 24); g.stroke();
    }
    g.globalAlpha = 1;
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }, { repeat });
}

// Dressed stone blocks with mortar.
export function stone({ w = 512, h = 512, base = [150, 140, 122], rows = 8, seed = 3, repeat = [1, 1], mortar = [92, 86, 76] } = {}) {
  const r = rng(seed), rh = h / rows, cuts = [];
  for (let i = 0; i < rows; i++) {
    const xs = [0]; let x = r() * 60;
    while (x < w) { xs.push(x); x += 70 + r() * 90; }
    xs.push(w); cuts.push({ xs, tints: xs.map(() => r() * 0.3 - 0.15) });
  }
  const { c } = pixels(w, h, (x, y) => {
    const row = Math.floor(y / rh), ly = y - row * rh, cr = cuts[row];
    let bi = 0; while (bi < cr.xs.length - 1 && cr.xs[bi + 1] <= x) bi++;
    const lx = x - cr.xs[bi], bw = (cr.xs[bi + 1] ?? w) - cr.xs[bi];
    const n = fbm3(x * 0.04, y * 0.04, seed, 4), s = noise3(x * 0.5, y * 0.5, seed);
    const k = 1 + cr.tints[bi] + (n - 0.5) * 0.5 + (s - 0.5) * 0.12;
    let col = base.map(v => v * k);
    const edge = Math.min(ly, rh - ly, lx, bw - lx);
    if (edge < 3) col = mortar.map(v => v * (0.9 + s * 0.2));
    else if (edge < 6) col = col.map(v => v * 0.85);
    return col;
  });
  return finish(c, { repeat });
}

// Brick for chimneys and fireplaces.
export function brick({ repeat = [1, 1] } = {}) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6b5c50'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let row = 0; row < 8; row++) for (let i = -1; i < 5; i++) {
      const x = i * 64 + (row % 2) * 32, y = row * 32;
      const t = r();
      g.fillStyle = `rgb(${82 + t * 34},${44 + t * 16},${34 + t * 10})`;
      g.fillRect(x + 2, y + 2, 60, 28);
    }
  }, { repeat });
}

// Rough painted siding / weatherboards (exterior).
export function siding({ color = [86, 92, 74], repeat = [1, 1] } = {}) {
  const { c } = pixels(128, 256, (x, y) => {
    const ly = y % 32, n = fbm3(x * 0.05, y * 0.01, 7, 3);
    let k = 0.85 + n * 0.3 - (ly < 3 ? 0.35 : 0) + (ly / 32) * 0.08;
    return color.map(v => v * k);
  });
  return finish(c, { repeat });
}

export function shingles({ repeat = [1, 1] } = {}) {
  const r = rng(11);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2622'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let i = 0; i < 9; i++) {
      const t = r(), x = i * 32 - (row % 2) * 16, y = row * 32;
      g.fillStyle = `rgb(${60 + t * 30},${52 + t * 24},${44 + t * 18})`;
      g.fillRect(x + 1, y + 1, 30, 30);
    }
  }, { repeat });
}

// Paper with optional handwriting-ish scribble lines.
export function paper({ w = 256, h = 340, lines = 14, ink = 'rgba(40,30,20,.75)', seed = 5, title = '', tint = '#efe4c8' } = {}) {
  const r = rng(seed);
  return canvas(w, h, (g) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      const e = Math.min(x, y, w - x, h - y);
      const n = (Math.random() - 0.5) * 10 - (e < 14 ? (14 - e) * 1.6 : 0);
      d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.2;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = ink; g.lineWidth = 1.6; g.lineCap = 'round';
    let y = 30;
    if (title) { g.fillStyle = ink; g.font = `bold ${Math.round(w / 14)}px "IM Fell English", Georgia, serif`; g.textAlign = 'center'; g.fillText(title, w / 2, y + 6); y += 26; }
    for (let i = 0; i < lines; i++) {
      let x = 22 + (i === 0 ? 18 : 0); const end = w - 20 - r() * (i % 5 === 4 ? 120 : 20);
      g.beginPath(); g.moveTo(x, y);
      while (x < end) { const nx = x + 3 + r() * 6; g.lineTo(nx, y + (r() - 0.5) * 3.5); x = nx; if (r() < 0.12) { x += 6; g.moveTo(x, y); } }
      g.stroke(); y += (h - 50) / (lines + 1);
    }
  }, { wrap: false });
}

// Soft round glow for sprites (additive).
export function glow(inner = 'rgba(255,240,200,1)', mid = 'rgba(255,190,110,.35)') {
  return canvas(128, 128, (g, w) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(0.2, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { wrap: false });
}

// A comet: bright nucleus with a long fanning tail pointing to +x.
export function comet() {
  return canvas(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(40, 0, w, 0);
    gr.addColorStop(0, 'rgba(235,245,255,.95)'); gr.addColorStop(0.25, 'rgba(170,205,255,.45)'); gr.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(36, h / 2 - 5); g.quadraticCurveTo(w * 0.5, h / 2 - 40, w, h / 2 - 60); g.lineTo(w, h / 2 + 50); g.quadraticCurveTo(w * 0.5, h / 2 + 30, 36, h / 2 + 5); g.fill();
    g.globalCompositeOperation = 'lighter';
    const g2 = g.createLinearGradient(40, 0, w * 0.8, 0);
    g2.addColorStop(0, 'rgba(255,255,255,.7)'); g2.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = g2; g.beginPath(); g.moveTo(36, h / 2 - 2); g.lineTo(w * 0.8, h / 2 - 14); g.lineTo(w * 0.8, h / 2 + 8); g.fill();
    const rg = g.createRadialGradient(40, h / 2, 0, 40, h / 2, 34);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(220,235,255,.6)'); rg.addColorStop(1, 'rgba(150,190,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 90, h);
  }, { wrap: false });
}

// Flame card for the candle and lamps.
export function flame() {
  return canvas(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(32, 92, 2, 32, 80, 50);
    gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.25, 'rgba(255,214,120,.95)');
    gr.addColorStop(0.6, 'rgba(255,120,30,.5)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(50, 50, 52, 82, 32, 116); g.bezierCurveTo(12, 82, 14, 50, 32, 6); g.fill();
    g.fillStyle = 'rgba(80,120,255,.45)'; g.beginPath(); g.ellipse(32, 108, 7, 9, 0, 0, Math.PI * 2); g.fill();
  }, { wrap: false });
}

// Tiny normal map of wobbly ripples for water (tiling).
export function waterNormal() {
  const w = 256;
  const hgt = (x, y) => fbm3(x / 22, y / 22, 4.2, 4) + 0.5 * noise3(x / 6, y / 9, 9.1);
  const { c } = pixels(w, w, (x, y) => {
    const s = 1 / w;
    const hx = hgt((x + 1) % w, y) - hgt((x - 1 + w) % w, y), hy = hgt(x, (y + 1) % w) - hgt(x, (y - 1 + w) % w);
    let nx = -hx * 3, ny = -hy * 3, nz = 1; const l = Math.hypot(nx, ny, nz) + s * 0;
    return [((nx / l) * 0.5 + 0.5) * 255, ((ny / l) * 0.5 + 0.5) * 255, ((nz / l) * 0.5 + 0.5) * 255];
  });
  return finish(c, { srgb: false, repeat: [40, 40] });
}

// Text card for in-world signs (chalkboards, placards, smoke writing). Returns a texture.
export function sign({ w = 512, h = 256, bg = null, color = '#222', font = '"IM Fell English", Georgia, serif', size = 40, lines = [], align = 'center', blur = 0, rotate = 0, pad = 30, lh = 1.25 } = {}) {
  return canvas(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.save();
    g.translate(w / 2, h / 2); g.rotate(rotate); g.translate(-w / 2, -h / 2);
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    if (blur) g.filter = `blur(${blur}px)`;
    const total = lines.length * size * lh;
    lines.forEach((ln, i) => {
      const o = typeof ln === 'string' ? { t: ln } : ln;
      g.font = `${o.style || ''} ${Math.round((o.size || size))}px ${o.font || font}`;
      const x = align === 'center' ? w / 2 : align === 'left' ? pad : w - pad;
      g.fillText(o.t, x, h / 2 - total / 2 + (i + 0.5) * size * lh);
    });
    g.restore();
  }, { wrap: false });
}

// Remap a geometry's UVs to planar coordinates from local x/y (or x/z), so pieces share one pattern.
export function planarUV(geo, scale = 1, axes = 'xy', off = [0, 0]) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const a = 'xyz'.indexOf(axes[0]), b = 'xyz'.indexOf(axes[1]);
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    uv.setXY(i, (v[a] + off[0]) * scale, (v[b] + off[1]) * scale);
  }
  uv.needsUpdate = true;
  return geo;
}
