// Every texture is painted on a canvas at load. Nothing to download, and the exporters can
// read the pixels back to put them in the GLB and USDZ files.
import * as THREE from 'three';
import { canvas, tex, makeRng, hsl } from './util.js';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// Needle colours for each kind of tree: [hue, sat, light] for the dark under-layer and the
// lit top layer, plus extras painted over them (silver undersides, snow, foil).
export const PALETTES = {
  fraser:   { dark: [148, 48, 8], light: [140, 44, 17], spread: 10, under: [178, 16, 40], underAmt: 0.16 },
  douglas:  { dark: [120, 40, 10], light: [108, 40, 21], spread: 12 },
  noble:    { dark: [170, 28, 11], light: [178, 22, 26], spread: 8, under: [192, 20, 48], underAmt: 0.22 },
  flocked:  { dark: [150, 30, 9], light: [146, 26, 17], spread: 10, snow: 0.55 },
  tinsel:   { dark: [210, 6, 52], light: [210, 8, 86], spread: 4, thin: true },
  scraggly: { dark: [92, 38, 13], light: [84, 42, 25], spread: 14, sparse: true },
  pink:     { dark: [335, 55, 58], light: [340, 70, 82], spread: 6, thin: true },
};

// A 4 x 4 atlas of fir sprays, 256 x 128 each. Row 0 is the shaded inside of the tree,
// row 3 the lit outer tips; the four columns are variations. u runs base (0) to tip (1).
export function needleAtlas(kind) {
  return once('needles:' + kind, () => {
    const P = PALETTES[kind];
    const CW = 256, CH = 128, c = canvas(CW * 4, CH * 4), g = c.getContext('2d');
    const rng = makeRng(kind.length * 977 + 13);
    g.lineCap = 'round';
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      g.save();
      g.translate(col * CW, (3 - row) * CH);
      g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
      spray(g, rng, CW, CH, P, row / 3);
      g.restore();
    }
    const t = tex(c);
    t.anisotropy = 8;
    t.generateMipmaps = true;
    return t;
  });
}

function spray(g, rng, W, H, P, lit) {
  // A flat fir spray seen from above: a stem, alternate side twigs angled forward,
  // and needles all along both, each one drawn so the edges stay a fringe, not a blob.
  const y0 = H / 2;
  const shade = (base, dl) => hsl(base[0] + (rng() - 0.5) * P.spread, base[1] + (rng() - 0.5) * 10, Math.max(3, base[2] + dl));
  const dim = (lit - 0.5) * 10;
  const bow = (rng() - 0.5) * 6;
  const stemY = x => y0 + Math.sin(x / W * Math.PI) * bow;
  const twigs = [];
  const gap = P.sparse ? 26 : P.thin ? 14 : 19;
  let side = rng() < 0.5 ? 1 : -1;
  for (let x = 10 + rng() * 6; x < W - 30; x += gap * (0.8 + rng() * 0.4)) {
    const t = x / W;
    const reach = H * 0.4 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)), 0.8) * (0.8 + rng() * 0.3);
    const ang = 0.7 + rng() * 0.25;
    twigs.push({ x, y: stemY(x), ex: x + Math.cos(ang) * reach, ey: stemY(x) + side * Math.sin(ang) * reach, side });
    side = -side;
  }
  const NL = P.thin ? 15 : P.sparse ? 10 : 12;
  const needleRun = (ax, ay, bx, by, len, light, thick) => {
    const d = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    const n = Math.max(4, d / (P.sparse ? 3.4 : P.thin ? 1.7 : 2.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const l = len * (0.6 + 0.4 * Math.sin(Math.PI * (0.15 + t * 0.85))) * (0.75 + rng() * 0.45);
      for (const s of [-1, 1]) {
        if (P.sparse && rng() < 0.4) continue;
        const a = ang + s * (1.05 + rng() * 0.35);
        g.strokeStyle = light ? shade(P.light, dim + t * 4) : shade(P.dark, dim);
        g.lineWidth = thick * (0.85 + rng() * 0.3);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  };
  g.lineCap = 'round';
  // Woody stem and twigs.
  g.strokeStyle = 'hsl(30,28%,20%)';
  g.lineWidth = 2.6; g.beginPath(); g.moveTo(2, stemY(0)); g.lineTo(W - 14, stemY(W)); g.stroke();
  g.lineWidth = 1.6;
  for (const tw of twigs) { g.beginPath(); g.moveTo(tw.x, tw.y); g.lineTo(tw.ex, tw.ey); g.stroke(); }
  // Dark needles underneath, lit ones on top, then the silver undersides some firs flash.
  const thick = P.thin ? 1.3 : 2.4;
  for (const light of [false, true]) {
    const L = light ? NL * 0.85 : NL;
    needleRun(4, stemY(4), W - 6, stemY(W), L * 1.1, light, light ? thick * 0.8 : thick);
    for (const tw of twigs) needleRun(tw.x, tw.y, tw.ex, tw.ey, L, light, light ? thick * 0.8 : thick);
  }
  if (P.under) {
    g.globalAlpha = P.underAmt * 2.2;
    for (const tw of twigs) if (rng() < 0.6) needleRun(tw.x, tw.y, tw.ex, tw.ey, NL * 0.6, false, 1.2);
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const tw = twigs[Math.floor(rng() * twigs.length)]; if (!tw) break; const t = rng(); g.strokeStyle = shade(P.under, 0); g.lineWidth = 1.1; const x = tw.x + (tw.ex - tw.x) * t, y = tw.y + (tw.ey - tw.y) * t, a = rng() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
  }
  // Fresh growth at the very tips is lighter.
  for (const tw of twigs) {
    g.strokeStyle = shade(P.light, 8 + lit * 6); g.lineWidth = thick * 0.7;
    const a0 = Math.atan2(tw.ey - tw.y, tw.ex - tw.x);
    for (let i = 0; i < 5; i++) { const a = a0 + (rng() - 0.5) * 1.6, l = 5 + rng() * 6; g.beginPath(); g.moveTo(tw.ex, tw.ey); g.lineTo(tw.ex + Math.cos(a) * l, tw.ey + Math.sin(a) * l); g.stroke(); }
  }
  // Snow from the flocking can, heaviest along the stem and on the lit rows.
  if (P.snow) {
    const n = Math.round(220 * (0.5 + lit));
    for (let i = 0; i < n; i++) {
      const t = rng(), tw = twigs[Math.floor(rng() * twigs.length)];
      let x, y;
      if (rng() < 0.35 || !tw) { x = 8 + t * (W - 24); y = stemY(x) + (rng() - 0.5) * 8; }
      else { x = tw.x + (tw.ex - tw.x) * t; y = tw.y + (tw.ey - tw.y) * t; }
      const r = 1.4 + rng() * 3.2 * P.snow;
      g.fillStyle = `hsla(200,25%,${88 + rng() * 12}%,${0.8 + rng() * 0.2})`;
      g.beginPath(); g.arc(x + (rng() - 0.5) * 7, y + (rng() - 0.5) * 7, r, 0, 7); g.fill();
    }
  }
}

// The inside of the tree: an opaque tangle of dark needles for the core cone, so gaps show depth, not plastic.
export function deepFoliage(kind, base) {
  return once('deep:' + kind, () => {
    const P = PALETTES[kind], S = 256, c = canvas(S, S), g = c.getContext('2d'), rng = makeRng(kind.length * 17 + 5);
    const bc = '#' + base.toString(16).padStart(6, '0');
    g.fillStyle = bc; g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = rng() * S, y = rng() * S, a = Math.PI * 0.5 + (rng() - 0.5) * 2.2, l = 6 + rng() * 10;
      const L = (P.thin ? P.light[2] * 0.7 : P.dark[2]) * (0.8 + rng() * 1.3);
      g.strokeStyle = hsl(P.dark[0] + (rng() - 0.5) * P.spread, P.dark[1], L);
      g.lineWidth = 1.5 + rng() * 1.5;
      for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); }
    }
    if (P.snow) for (let i = 0; i < 500; i++) { g.fillStyle = `hsla(200,20%,${80 + rng() * 15}%,0.6)`; g.beginPath(); g.arc(rng() * S, rng() * S, 1 + rng() * 2.5, 0, 7); g.fill(); }
    return tex(c, { repeat: true });
  });
}

export function barkTexture() {
  return once('bark', () => {
    const c = canvas(128, 512), g = c.getContext('2d'), rng = makeRng(7);
    g.fillStyle = '#4a3423'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 500; i++) {
      g.strokeStyle = `hsla(${22 + rng() * 14},${25 + rng() * 15}%,${12 + rng() * 22}%,0.7)`;
      g.lineWidth = 1 + rng() * 3;
      const x = rng() * 128, y = rng() * 512, l = 10 + rng() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 4, y + l); g.stroke();
    }
    return tex(c, { repeat: true });
  });
}

// Wrapping paper designs. Each returns a repeating texture.
export const PAPERS = ['stripes', 'dots', 'plaid', 'kraft', 'snowflakes', 'foil', 'trees', 'candy'];

export function paperTexture(kind, c1, c2) {
  return once(`paper:${kind}:${c1}:${c2}`, () => {
    const S = 256, c = canvas(S, S), g = c.getContext('2d'), rng = makeRng(kind.length * 31 + c1.length);
    g.fillStyle = c1; g.fillRect(0, 0, S, S);
    if (kind === 'stripes') {
      g.fillStyle = c2;
      for (let i = -S; i < S * 2; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i + 20 - S, S); g.lineTo(i - S, S); g.fill(); }
    } else if (kind === 'dots') {
      g.fillStyle = c2;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const ox = (y % 2) * 32;
        g.beginPath(); g.arc(x * 64 + ox + 16, y * 64 + 16, 11, 0, 7); g.fill();
        g.beginPath(); g.arc(x * 64 + ox + 16 - S, y * 64 + 16, 11, 0, 7); g.fill();
      }
    } else if (kind === 'plaid') {
      g.globalAlpha = 0.55; g.fillStyle = c2;
      for (let i = 0; i < S; i += 64) { g.fillRect(i + 8, 0, 22, S); g.fillRect(0, i + 8, S, 22); }
      g.globalAlpha = 0.6; g.fillStyle = '#f4e9c8';
      for (let i = 0; i < S; i += 64) { g.fillRect(i + 44, 0, 3, S); g.fillRect(0, i + 44, S, 3); }
      g.globalAlpha = 0.25; g.fillStyle = '#000';
      for (let i = 0; i < S; i += 64) { g.fillRect(i + 15, 0, 8, S); g.fillRect(0, i + 15, S, 8); }
      g.globalAlpha = 1;
    } else if (kind === 'kraft') {
      g.fillStyle = '#b48a5a'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${80 + rng() * 60},${50 + rng() * 40},20,0.12)`; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1); }
      g.strokeStyle = c2; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) star(g, 20 + (i % 3) * 85 + (i > 2 ? 42 : 0), 40 + Math.floor(i / 3) * 128, 13, 5);
    } else if (kind === 'snowflakes') {
      g.strokeStyle = c2; g.lineWidth = 3; g.lineCap = 'round';
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) flake(g, x * 86 + 43 + (y % 2) * 20, y * 86 + 43, 22);
    } else if (kind === 'foil') {
      const gr = g.createLinearGradient(0, 0, S, S);
      gr.addColorStop(0, c1); gr.addColorStop(0.5, c2); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.25})`; g.fillRect(rng() * S, rng() * S, 2, 2); }
    } else if (kind === 'trees') {
      g.fillStyle = c2;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 64 + 32 + (y % 2) * 32 - (y % 2 && x === 3 ? S : 0), cy = y * 64 + 14;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 14, cy + 34); g.lineTo(cx - 14, cy + 34); g.fill();
        g.fillRect(cx - 3, cy + 34, 6, 8);
      }
    } else if (kind === 'candy') {
      g.fillStyle = c2;
      for (let i = 0; i < S; i += 32) g.fillRect(0, i, S, 12);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < S; i += 32) g.fillRect(0, i + 18, S, 3);
    }
    return tex(c, { repeat: true });
  });
}

function star(g, x, y, r, n) {
  g.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.stroke();
}

function flake(g, x, y, r) {
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, cx = Math.cos(a), sy = Math.sin(a);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + cx * r, y + sy * r); g.stroke();
    for (const t of [0.5, 0.75]) {
      const px = x + cx * r * t, py = y + sy * r * t, l = r * 0.28;
      for (const s of [-1, 1]) { const b = a + s * 0.8; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l); g.stroke(); }
    }
  }
}

// Red and white spiral for candy canes: stripes run diagonally so a tube wraps them into a helix.
export function candyStripe() {
  return once('candy', () => {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#f7f2ea'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c8102e';
    for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 14, 0); g.lineTo(i + 14 + 128, 128); g.lineTo(i + 128, 128); g.fill(); }
    g.fillStyle = '#2e8b3e';
    for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i + 20, 0); g.lineTo(i + 23, 0); g.lineTo(i + 23 + 128, 128); g.lineTo(i + 20 + 128, 128); g.fill(); }
    return tex(c, { repeat: true });
  });
}

// Tinsel strands on transparency, for the garland cards.
export function tinselTexture() {
  return once('tinsel', () => {
    const c = canvas(64, 256), g = c.getContext('2d'), rng = makeRng(3);
    for (let i = 0; i < 220; i++) {
      const x = rng() * 64, l = 18 + rng() * 26, y = rng() * 256;
      g.strokeStyle = `hsl(0,0%,${70 + rng() * 30}%)`;
      g.lineWidth = 0.8 + rng() * 1.2;
      g.beginPath(); g.moveTo(32, y); g.lineTo(x, y + (rng() - 0.5) * l); g.stroke();
    }
    g.fillStyle = '#ddd'; g.fillRect(29, 0, 6, 256);
    return tex(c, { repeat: true });
  });
}

// Tree skirt fabrics.
export function skirtTexture(kind) {
  return once('skirt:' + kind, () => {
    const S = 512, c = canvas(S, S), g = c.getContext('2d'), rng = makeRng(kind.length * 5);
    if (kind === 'velvet') {
      g.fillStyle = '#8e1020'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${120 + rng() * 80},10,25,${rng() * 0.25})`; g.fillRect(rng() * S, rng() * S, 2, 2); }
    } else if (kind === 'plaid') {
      g.fillStyle = '#9b1b1f'; g.fillRect(0, 0, S, S);
      g.globalAlpha = 0.6; g.fillStyle = '#102a1a';
      for (let i = 0; i < S; i += 128) { g.fillRect(i + 20, 0, 50, S); g.fillRect(0, i + 20, S, 50); }
      g.globalAlpha = 0.8; g.fillStyle = '#e8c45a';
      for (let i = 0; i < S; i += 128) { g.fillRect(i + 96, 0, 4, S); g.fillRect(0, i + 96, S, 4); }
      g.globalAlpha = 0.3; g.fillStyle = '#000';
      for (let i = 0; i < S; i += 128) { g.fillRect(i + 36, 0, 18, S); g.fillRect(0, i + 36, S, 18); }
      g.globalAlpha = 1;
    } else if (kind === 'knit') {
      g.fillStyle = '#ece3d0'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#d9ccb2'; g.lineWidth = 3;
      for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 14); g.lineTo(x + 16, y); g.stroke();
      }
      g.fillStyle = '#b3242c';
      for (let x = 0; x < S; x += 32) { g.fillRect(x, 200, 16, 16); g.fillRect(x + 16, 216, 16, 16); g.fillRect(x, 300, 16, 16); g.fillRect(x + 16, 316, 16, 16); }
    } else if (kind === 'burlap') {
      g.fillStyle = '#a78a5e'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < S; i += 6) {
        g.fillStyle = `rgba(70,50,25,${0.15 + rng() * 0.2})`; g.fillRect(i, 0, 2, S);
        g.fillStyle = `rgba(70,50,25,${0.15 + rng() * 0.2})`; g.fillRect(0, i, S, 2);
      }
    }
    return tex(c, { repeat: true });
  });
}

// Woven basket collar.
export function weaveTexture() {
  return once('weave', () => {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 32) {
      const over = ((x + y) / 32) % 2;
      const gr = over ? g.createLinearGradient(x, 0, x + 32, 0) : g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, '#6e4b28'); gr.addColorStop(0.5, '#c79a62'); gr.addColorStop(1, '#6e4b28');
      g.fillStyle = gr; g.fillRect(x + 1, y + 1, 30, 30);
    }
    return tex(c, { repeat: true });
  });
}

// Glitter: a speckled roughness map makes metallic baubles sparkle under moving light.
export function glitterTexture() {
  return once('glitter', () => {
    const S = 128, c = canvas(S, S), g = c.getContext('2d'), rng = makeRng(99);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { const v = Math.floor(rng() * 120); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rng() * S, rng() * S, 1.5, 1.5); }
    return tex(c, { repeat: true, srgb: false });
  });
}

// Stripes for striped baubles: a white band pattern multiplied by the bauble colour.
export function baubleStripes() {
  return once('bstripe', () => {
    const c = canvas(64, 256), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#f1d27a';
    for (const y of [70, 120, 170]) g.fillRect(0, y, 64, y === 120 ? 22 : 8);
    return tex(c, { repeat: true });
  });
}

// Gingerbread biscuit with icing.
export function gingerTexture() {
  return once('ginger', () => {
    const S = 128, c = canvas(S, S), g = c.getContext('2d'), rng = makeRng(12);
    g.fillStyle = '#a3602b'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,40,10,${rng() * 0.3})`; g.fillRect(rng() * S, rng() * S, 2, 2); }
    g.strokeStyle = '#fff7ee'; g.lineWidth = 3; g.lineCap = 'round';
    // eyes, smile, buttons (the shape's UVs map the biscuit to 0..1)
    g.fillStyle = '#fff7ee';
    g.beginPath(); g.arc(54, 30, 3.5, 0, 7); g.arc(74, 30, 3.5, 0, 7); g.fill();
    g.beginPath(); g.arc(64, 36, 9, 0.3, Math.PI - 0.3); g.stroke();
    g.fillStyle = '#d8212f'; for (const y of [66, 80]) { g.beginPath(); g.arc(64, y, 4, 0, 7); g.fill(); }
    g.strokeStyle = '#fff7ee';
    g.beginPath(); g.moveTo(20, 60); g.quadraticCurveTo(25, 54, 30, 60); g.quadraticCurveTo(35, 66, 40, 60); g.stroke();
    g.beginPath(); g.moveTo(88, 60); g.quadraticCurveTo(93, 54, 98, 60); g.quadraticCurveTo(103, 66, 108, 60); g.stroke();
    g.beginPath(); g.moveTo(44, 112); g.quadraticCurveTo(49, 106, 54, 112); g.stroke();
    g.beginPath(); g.moveTo(74, 112); g.quadraticCurveTo(79, 106, 84, 112); g.stroke();
    return tex(c);
  });
}

// Soft round glow for the light halos (live view and AR only).
export function glowTexture() {
  return once('glow', () => {
    const S = 64, c = canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return tex(c, { srgb: false });
  });
}

// The floor in the builder: warm oak planks.
export function floorTexture() {
  return once('floor', () => {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), rng = makeRng(41);
    for (let row = 0; row < 8; row++) {
      let x = -rng() * 200;
      while (x < W) {
        const len = 160 + rng() * 200, l = 30 + rng() * 10;
        g.fillStyle = `hsl(${26 + rng() * 6},${38 + rng() * 10}%,${l}%)`;
        g.fillRect(x, row * 64, len, 64);
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = `hsla(25,40%,${l - 8 + rng() * 6}%,0.35)`; g.lineWidth = 1;
          const y = row * 64 + rng() * 64;
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (rng() - 0.5) * 6, x + len * 0.7, y + (rng() - 0.5) * 6, x + len, y); g.stroke();
        }
        g.fillStyle = 'rgba(30,15,5,0.6)'; g.fillRect(x, row * 64, 2, 64);
        x += len;
      }
      g.fillStyle = 'rgba(30,15,5,0.5)'; g.fillRect(0, row * 64, W, 2);
    }
    const t = tex(c, { repeat: true });
    t.repeat.set(4, 4);
    return t;
  });
}

export function roughnessFlat() { return null; }

export { THREE };
