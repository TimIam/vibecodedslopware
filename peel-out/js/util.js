// Small shared helpers and the procedural canvas textures for the kitchen.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Fine noise sprinkled over a canvas.
function speckle(ctx, w, h, n, rgba, rng, size = 1) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = rgba(rng()); ctx.fillRect(rng() * w, rng() * h, size, size); }
}

// White subway tile with grey grout. Returns {map, bump}.
export function tileTextures() {
  const rng = makeRng(3), W = 512, H = 512, c = canvas(W, H), b = canvas(W, H);
  const x = c.getContext('2d'), y = b.getContext('2d');
  x.fillStyle = '#b9b2a5'; x.fillRect(0, 0, W, H);
  y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
  const tw = 128, th = 64, g = 5;
  for (let r = 0; r < H / th; r++) for (let k = -1; k < W / tw + 1; k++) {
    const ox = (r % 2) * tw / 2 + k * tw, oy = r * th;
    const v = 236 + Math.floor(rng() * 14);
    const grd = x.createLinearGradient(0, oy, 0, oy + th);
    grd.addColorStop(0, `rgb(${v},${v - 2},${v - 8})`); grd.addColorStop(1, `rgb(${v - 14},${v - 15},${v - 20})`);
    x.fillStyle = grd; roundRect(x, ox + g / 2, oy + g / 2, tw - g, th - g, 7); x.fill();
    const gy = y.createLinearGradient(0, oy, 0, oy + th);
    gy.addColorStop(0, '#d8d8d8'); gy.addColorStop(0.2, '#fff'); gy.addColorStop(0.85, '#f4f4f4'); gy.addColorStop(1, '#b0b0b0');
    y.fillStyle = gy; roundRect(y, ox + g / 2, oy + g / 2, tw - g, th - g, 7); y.fill();
    // a soft highlight streak on the glaze
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(ox + 10, oy + 8, tw * 0.5, 3);
  }
  speckle(x, W, H, 1400, () => `rgba(120,110,95,${0.05 + rng() * 0.08})`, rng, 2);
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// Butcher block: glued maple strips with end-grain flecks.
export function butcherTexture() {
  const rng = makeRng(7), W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
  const sw = 32;
  for (let i = 0; i < W / sw; i++) {
    const hue = 30 + rng() * 10, l = 58 + rng() * 14;
    x.fillStyle = `hsl(${hue},${38 + rng() * 14}%,${l}%)`; x.fillRect(i * sw, 0, sw, H);
    for (let k = 0; k < 26; k++) {
      x.strokeStyle = `hsla(${hue - 6},45%,${l - 14 - rng() * 10}%,${0.15 + rng() * 0.25})`; x.lineWidth = 0.6 + rng() * 1.4;
      x.beginPath(); const px = i * sw + rng() * sw; x.moveTo(px, 0);
      for (let yy = 0; yy <= H; yy += 32) x.lineTo(px + Math.sin(yy * 0.02 + k) * 2.5, yy);
      x.stroke();
    }
    x.fillStyle = 'rgba(60,35,15,0.35)'; x.fillRect(i * sw, 0, 1.5, H);
  }
  speckle(x, W, H, 2500, () => `rgba(255,255,255,${rng() * 0.12})`, rng, 2);
  // knife scuffs
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(80,50,25,${0.08 + rng() * 0.12})`; x.lineWidth = 1;
    const a = rng() * Math.PI, l = 20 + rng() * 60, px = rng() * W, py = rng() * H;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  return tex(c);
}

// Light birch for the wood peel.
export function peelWoodTexture() {
  const rng = makeRng(17), W = 256, H = 512, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#d6b07c'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    x.strokeStyle = `rgba(${130 + rng() * 40},${80 + rng() * 30},${40 + rng() * 20},${0.12 + rng() * 0.2})`; x.lineWidth = 0.8 + rng() * 2;
    x.beginPath(); const px = rng() * W; x.moveTo(px, 0);
    for (let yy = 0; yy <= H; yy += 16) x.lineTo(px + Math.sin(yy * 0.012 + k * 1.7) * 6 + Math.sin(yy * 0.05) * 1.5, yy);
    x.stroke();
  }
  // scorch marks from the oven mouth along the blade tip
  const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, 'rgba(70,35,10,0.55)'); g.addColorStop(1, 'rgba(70,35,10,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, 120);
  return tex(c);
}

// Brushed stainless: streaky roughness, faint smudges.
export function steelTextures() {
  const rng = makeRng(5), W = 512, c = canvas(W, W), x = c.getContext('2d'), r = canvas(W, W), y = r.getContext('2d');
  x.fillStyle = '#c9ccd0'; x.fillRect(0, 0, W, W);
  y.fillStyle = '#5a5a5a'; y.fillRect(0, 0, W, W);
  for (let i = 0; i < 2600; i++) {
    const py = rng() * W, l = 40 + rng() * 260, px = rng() * W, v = Math.floor(rng() * 50);
    x.fillStyle = `rgba(${180 + v},${184 + v},${190 + v},0.25)`; x.fillRect(px, py, l, 1);
    y.fillStyle = `rgba(${60 + v * 2},${60 + v * 2},${60 + v * 2},0.3)`; y.fillRect(px, py, l, 1);
  }
  for (let i = 0; i < 26; i++) {
    const gx = rng() * W, gy = rng() * W, gr = 20 + rng() * 60;
    const g = y.createRadialGradient(gx, gy, 0, gx, gy, gr); g.addColorStop(0, 'rgba(150,150,150,0.35)'); g.addColorStop(1, 'rgba(150,150,150,0)');
    y.fillStyle = g; y.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
  return { map: tex(c), rough: tex(r, { srgb: false }) };
}

// Red quarry tile floor.
export function floorTexture() {
  const rng = makeRng(9), W = 512, c = canvas(W, W), x = c.getContext('2d');
  x.fillStyle = '#3a2620'; x.fillRect(0, 0, W, W);
  const t = 128;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const l = 30 + rng() * 8;
    x.fillStyle = `hsl(${8 + rng() * 6},${45 + rng() * 10}%,${l}%)`; x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    speckle(x, 0, 0, 0, () => '', rng);
    for (let k = 0; k < 120; k++) { x.fillStyle = `rgba(0,0,0,${rng() * 0.12})`; x.fillRect(i * t + 3 + rng() * (t - 6), j * t + 3 + rng() * (t - 6), 3, 3); }
  }
  return tex(c);
}

// Brick for the oven surround.
export function brickTexture() {
  const rng = makeRng(21), W = 512, c = canvas(W, W), x = c.getContext('2d');
  x.fillStyle = '#d9cfc0'; x.fillRect(0, 0, W, W);
  const bw = 128, bh = 42;
  for (let r = 0; r < W / bh + 1; r++) for (let k = -1; k < W / bw + 1; k++) {
    const ox = (r % 2) * bw / 2 + k * bw, oy = r * bh;
    x.fillStyle = `hsl(${8 + rng() * 10},${48 + rng() * 15}%,${30 + rng() * 12}%)`;
    roundRect(x, ox + 3, oy + 3, bw - 6, bh - 6, 4); x.fill();
    for (let n = 0; n < 40; n++) { x.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,220,190'},${rng() * 0.12})`; x.fillRect(ox + 3 + rng() * (bw - 6), oy + 3 + rng() * (bh - 6), 3, 2); }
    // soot toward the top
  }
  const g = x.createLinearGradient(0, 0, 0, W * 0.5); g.addColorStop(0, 'rgba(20,10,5,0.35)'); g.addColorStop(1, 'rgba(20,10,5,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  return tex(c);
}

// Red-and-white tablecloth for the dining room.
export function checkTexture() {
  const c = canvas(128), x = c.getContext('2d');
  x.fillStyle = '#f3ece0'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(190,30,35,0.75)';
  for (let i = 0; i < 8; i++) { x.fillRect(i * 16, 0, 8, 128); x.fillRect(0, i * 16, 128, 8); }
  return tex(c, { repeat: [3, 3] });
}

// A soft round sprite for flour, smoke and steam.
export function softDot() {
  const c = canvas(64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false });
}

// Text painted onto a canvas, for labels and the neon sign.
export function labelTexture(text, { w = 256, h = 64, bg = '#f5efe2', fg = '#222', font = '700 34px "Segoe UI",system-ui,sans-serif', border = null, glow = null } = {}) {
  const c = canvas(w, h), x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  if (border) { x.strokeStyle = border; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4); }
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = glow; x.shadowBlur = 18; for (let i = 0; i < 3; i++) { x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 2); } }
  x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 2);
  return tex(c, { repeat: [1, 1] });
}

export function roundRect(x, px, py, w, h, r) {
  x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
}
