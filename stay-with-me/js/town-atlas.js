// Canvas-drawn atlases for the town: one for everything with lettering on it (street-name blades, traffic signs,
// shop signs, hospital signs, billboards, house numbers), one for alpha cut-outs (leaf clusters, conifer boughs,
// chain-link, pickets, railings). Plus the two materials that use them and the list of fictional businesses.
// Sign quads carry their glow level in aCol.r (0 = painted, 255 = bright illuminated box sign), aCol.g = flicker.

import * as THREE from 'three';
import { U, patchWet } from './gfx.js';
import { makeRng, makeCanvas } from './util.js';

// Guillotine packer: keeps a list of free rectangles, places each sign in the tightest one and splits the remainder.
export class SignAtlas {
  constructor(size = 4096) { this.size = size; this.cv = makeCanvas(size); this.g = this.cv.getContext('2d'); this.free = [[0, 0, size, size]]; this.map = new Map(); this.full = 0; }
  add(key, w, h, draw) {
    let r = this.map.get(key); if (r) return r;
    const W = w + 4, H = h + 4, F = this.free; let bi = -1, bs = 1e9;
    for (let i = 0; i < F.length; i++) { const f = F[i]; if (f[2] >= W && f[3] >= H) { const s = Math.min(f[2] - W, f[3] - H); if (s < bs) { bs = s; bi = i; } } }
    if (bi < 0) { if (!this.full++) console.warn('[town] sign atlas full at', key); return this.map.get('white') || this.map.values().next().value; }
    const f = F[bi]; F.splice(bi, 1);
    // split along the shorter leftover so big free areas stay big
    if (f[2] - W < f[3] - H) { if (f[2] - W > 8) F.push([f[0] + W, f[1], f[2] - W, H]); if (f[3] - H > 8) F.push([f[0], f[1] + H, f[2], f[3] - H]); }
    else { if (f[3] - H > 8) F.push([f[0], f[1] + H, W, f[3] - H]); if (f[2] - W > 8) F.push([f[0] + W, f[1], f[2] - W, f[3]]); }
    const g = this.g, x = f[0] + 2, y = f[1] + 2; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h); g.restore();
    r = { u0: x / this.size, v0: 1 - (y + h) / this.size, u1: (x + w) / this.size, v1: 1 - y / this.size, w, h }; this.map.set(key, r); return r;
  }
  texture(aniso = 8) { const t = new THREE.CanvasTexture(this.cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }
}

const FONTS = ['"Arial Narrow", "Roboto Condensed", Arial, sans-serif', 'Georgia, "Times New Roman", serif', 'Impact, "Arial Black", sans-serif', '"Trebuchet MS", Verdana, sans-serif', '"Brush Script MT", "Segoe Script", cursive', '"Courier New", monospace', '"Arial Black", Arial, sans-serif', '"Palatino Linotype", Palatino, serif'];
function fitText(g, text, maxW, px, font, weight = 700) { do { g.font = `${weight} ${px}px ${font}`; if (g.measureText(text).width <= maxW) break; px -= 2; } while (px > 8); return px; }
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

export const SIGN = {
  blade(A, name) {
    return A.add('blade:' + name, 384, 72, (g, w, h) => { g.scale(384 / 448, 72 / 84); w = 448; h = 84;
      g.fillStyle = '#0a5a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2f4f0'; g.lineWidth = 5; rr(g, 5, 5, w - 10, h - 10, 10); g.stroke();
      const m = name.match(/^(.*?)\s+(St|Ave|Rd|Dr|Way|Row|Alley|Blvd)$/), main = (m ? m[1] : name).toUpperCase(), suf = m ? m[2].toUpperCase() : '';
      g.fillStyle = '#f6f8f4'; g.textBaseline = 'middle'; g.textAlign = 'left';
      const sw = suf ? 62 : 0; const px = fitText(g, main, w - 46 - sw, 50, FONTS[0]); const tw = g.measureText(main).width, x0 = (w - tw - sw) / 2;
      g.fillText(main, x0, h / 2 + 3); if (suf) { g.font = `700 26px ${FONTS[0]}`; g.fillText(suf, x0 + tw + 10, h / 2 - 7); } void px;
    });
  },
  stop(A) { return A.add('stop', 256, 256, (g, w) => { const c = w / 2, R = 122; const oct = r => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.closePath(); }; oct(R); g.fillStyle = '#f4f4f0'; g.fill(); oct(R - 9); g.fillStyle = '#b3161a'; g.fill(); g.fillStyle = '#f4f4f0'; g.font = `700 92px ${FONTS[0]}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', c, c + 5); }); },
  speed(A, mph) { return A.add('speed' + mph, 192, 240, (g, w, h) => { g.fillStyle = '#f3f3ee'; rr(g, 2, 2, w - 4, h - 4, 14); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; rr(g, 9, 9, w - 18, h - 18, 10); g.stroke(); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `700 40px ${FONTS[0]}`; g.fillText('SPEED', w / 2, 58); g.fillText('LIMIT', w / 2, 100); g.font = `700 120px ${FONTS[0]}`; g.fillText(String(mph), w / 2, 212); }); },
  oneway(A) { return A.add('oneway', 384, 128, (g, w, h) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#f3f3ee'; g.beginPath(); g.moveTo(20, 40); g.lineTo(280, 40); g.lineTo(280, 16); g.lineTo(366, 64); g.lineTo(280, 112); g.lineTo(280, 88); g.lineTo(20, 88); g.closePath(); g.fill(); g.fillStyle = '#111'; g.font = `700 38px ${FONTS[0]}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ONE WAY', 150, 66); }); },
  hosp(A, dir) { return A.add('hosp' + dir, 192, 256, (g, w, h) => { g.fillStyle = '#17479e'; rr(g, 2, 2, w - 4, h - 4, 14); g.fill(); g.strokeStyle = '#f3f3ee'; g.lineWidth = 6; rr(g, 9, 9, w - 18, h - 18, 10); g.stroke(); g.fillStyle = '#f3f3ee'; g.textAlign = 'center'; g.font = `700 150px Arial, sans-serif`; g.fillText('H', w / 2, 150); g.save(); g.translate(w / 2, 205); g.rotate(dir * Math.PI / 2); g.beginPath(); g.moveTo(-50, -10); g.lineTo(14, -10); g.lineTo(14, -26); g.lineTo(54, 0); g.lineTo(14, 26); g.lineTo(14, 10); g.lineTo(-50, 10); g.closePath(); g.fill(); g.restore(); }); },
  bus(A) { return A.add('bus', 160, 200, (g, w, h) => { g.fillStyle = '#1b5fa8'; rr(g, 2, 2, w - 4, h - 4, 10); g.fill(); g.fillStyle = '#fff'; rr(g, 30, 30, 100, 80, 12); g.fill(); g.fillStyle = '#1b5fa8'; g.fillRect(40, 42, 80, 30); g.fillStyle = '#fff'; g.font = `700 24px ${FONTS[0]}`; g.textAlign = 'center'; g.fillText('KETTER', w / 2, 142); g.fillText('TRANSIT', w / 2, 170); }); },
  nopark(A) { return A.add('nopark', 160, 200, (g, w, h) => { g.fillStyle = '#f3f3ee'; rr(g, 2, 2, w - 4, h - 4, 10); g.fill(); g.strokeStyle = '#b3161a'; g.lineWidth = 5; rr(g, 8, 8, w - 16, h - 16, 8); g.stroke(); g.fillStyle = '#b3161a'; g.textAlign = 'center'; g.font = `700 30px ${FONTS[0]}`; g.fillText('NO', w / 2, 52); g.fillText('PARKING', w / 2, 86); g.font = `700 22px ${FONTS[0]}`; g.fillText('ANY TIME', w / 2, 122); g.fillText('FIRE LANE', w / 2, 168); }); },
  num(A, n) { return A.add('num' + n, 72, 30, (g, w, h) => { g.fillStyle = '#16181a'; rr(g, 1, 1, w - 2, h - 2, 4); g.fill(); g.fillStyle = '#d9c48a'; g.font = `700 22px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 2); }); },
  // Generic lettered panel. o: { w, h, bg, fg, font (index), sub, subFg, border, weight, italic, stripe }
  text(A, key, text, o = {}) {
    // very wide panels are stored at three-quarter size: they are monument and roofline signs seen from a distance
    const k = (o.w || 512) >= 1000 ? 0.75 : 1, w = o.w || 512, h = o.h || 128;
    return A.add(key, Math.round(w * k), Math.round(h * k), g => {
      g.scale(k, k);
      if (o.bg !== 'none') { g.fillStyle = o.bg || '#222'; g.fillRect(0, 0, w, h); }
      if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(0, h * 0.82, w, h * 0.08); }
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(3, h * 0.04); g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2); }
      g.fillStyle = o.fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const font = FONTS[o.font ?? 0], lines = text.split('\n'), sub = o.sub, th = h * (sub ? 0.66 : 0.9) / lines.length;
      lines.forEach((ln, i) => { fitText(g, ln, w * 0.9, Math.floor(th * 0.82), font, o.weight || 700); if (o.italic) g.font = 'italic ' + g.font; g.fillText(ln, w / 2, (sub ? h * 0.04 : h * 0.05) + th * (i + 0.5)); });
      if (sub) { g.fillStyle = o.subFg || o.fg || '#fff'; fitText(g, sub, w * 0.88, Math.floor(h * 0.2), FONTS[3], 600); g.fillText(sub, w / 2, h * 0.84); }
    });
  },
  // A storefront fascia sign in one of several looks derived from the seed.
  shop(A, name, seed) {
    const r = makeRng(seed * 7919 + 13);
    const pal = [['#1d2a3a', '#f0e6c8'], ['#7a1d1d', '#f6efe0'], ['#f1ead8', '#2b2b2b'], ['#15402e', '#f3ead0'], ['#1a1a1a', '#e9b33a'], ['#e8e4dc', '#8a1c1c'], ['#2b4f77', '#ffffff'], ['#3a2a1e', '#f0d9a8'], ['#f4f1ea', '#1d3d6b'], ['#5b2a55', '#f4e9f2'], ['#0e0e10', '#f24b4b'], ['#d9a521', '#1c1c1c']];
    const [bg, fg] = r.pick(pal), font = r.i(0, FONTS.length - 1);
    return SIGN.text(A, 'shop:' + name, name.toUpperCase() === name || font === 4 ? name : (r.chance(0.6) ? name.toUpperCase() : name), { w: 384, h: 84, bg, fg, font, border: r.chance(0.4) ? fg : null });
  },
  billboard(A, i) {
    const ads = [['KETTER COUNTY\nCREDIT UNION', 'Banking that stays local.', '#12355b', '#ffffff', '#f2b53a'], ['INJURED?', 'REYES & CHEN  ·  555-0142', '#f2c21a', '#111111', '#b3161a'], ['FreshWay', 'Fresh. Local. Every day.', '#1f7a3e', '#ffffff', '#f6e27a'], ['ST. BRIGID REGIONAL', 'Level II Trauma Center  ·  Exit Kessler St', '#f4f1ea', '#17479e', '#b3161a'], ['HALLORAN FALLS\nTIMBER DAYS', 'August 14–16  ·  Riverside Park', '#2b3a2e', '#f0e3c0', '#d98a2b'], ['CASCADE FREIGHT', 'Now hiring CDL drivers', '#1a1a1a', '#f24b2f', '#ffffff']];
    const a = ads[i % ads.length];
    return A.add('bb' + (i % ads.length), 640, 280, (g, w, h) => { g.scale(0.625, 0.625); w = 1024; h = 448;
      g.fillStyle = a[2]; g.fillRect(0, 0, w, h); g.fillStyle = a[4]; g.fillRect(0, h * 0.74, w, h * 0.26);
      g.fillStyle = a[3]; g.textAlign = 'center'; g.textBaseline = 'middle'; const lines = a[0].split('\n');
      lines.forEach((ln, k) => { fitText(g, ln, w * 0.88, lines.length > 1 ? 130 : 190, FONTS[i % 2 ? 2 : 6]); g.fillText(ln, w / 2, h * 0.37 + (k - (lines.length - 1) / 2) * 140); });
      g.fillStyle = a[2]; fitText(g, a[1], w * 0.9, 56, FONTS[3], 700); g.fillText(a[1], w / 2, h * 0.87);
    });
  },
  helipad(A) { return A.add('helipad', 384, 384, (g, w) => { g.scale(0.75, 0.75); w = 512; g.clearRect(0, 0, w, w); g.strokeStyle = '#e9e9e2'; g.lineWidth = 16; g.beginPath(); g.arc(256, 256, 236, 0, 7); g.stroke(); g.fillStyle = '#b3161a'; g.beginPath(); g.arc(256, 256, 200, 0, 7); g.fill(); g.fillStyle = '#f2f2ec'; g.fillRect(150, 110, 54, 292); g.fillRect(308, 110, 54, 292); g.fillRect(150, 230, 212, 54); }); },
};

// name, address kind
export const BUSINESSES = [
  ['Ketter River Grill', 'restaurant'], ['Golden Dragon', 'restaurant'], ['Pho Ketter', 'restaurant'], ["Luigi's Pizzeria", 'restaurant'], ['Taqueria El Faro', 'restaurant'], ['Blue Heron Cafe', 'restaurant'], ['Timberline Coffee', 'restaurant'], ['The Daily Grind', 'restaurant'], ['Falls Bakery', 'restaurant'], ["Sal's Deli", 'restaurant'], ['Cedar Plank Smokehouse', 'restaurant'], ['Noodle House', 'restaurant'], ['Sunrise Donuts', 'restaurant'], ['Mill Street Bagels', 'restaurant'], ['Bombay Kitchen', 'restaurant'], ['Teriyaki Time', 'restaurant'],
  ['Rusty Nail Tavern', 'bar'], ['Kessler Taproom', 'bar'], ["Lucky's Lounge", 'bar'], ["The Logger's Rest", 'bar'], ['Night Owl Billiards', 'bar'],
  ['Halloran Hardware', 'shop'], ['Fern & Moss Florist', 'shop'], ['Second Chapter Books', 'shop'], ['Ketter Cycle', 'shop'], ['Northwest Outfitters', 'shop'], ['Falls Pharmacy', 'shop'], ['Main Street Barber', 'shop'], ['Lavish Nails', 'shop'], ['Corner Market', 'shop'], ['Vinyl Junction', 'shop'], ['Bright Cleaners', 'shop'], ['Sew & So Fabrics', 'shop'], ['Falls Pawn & Loan', 'shop'], ['Tidewater Antiques', 'shop'], ['Paws & Claws Pet Supply', 'shop'], ['Summit Shoes', 'shop'], ['Clockworks Repair', 'shop'], ['Riverbend Music', 'shop'], ['Value Thrift', 'shop'], ["Wash 'n' Fold", 'shop'], ['Cascade Camera', 'shop'], ['Card & Party', 'shop'], ['Sleep Well Mattress', 'shop'], ['Emerald City Tattoo', 'shop'], ['Kessler Optical', 'shop'], ['Sunny Day Toys', 'shop'], ['Old Town Liquor', 'shop'], ['Hobby Depot', 'shop'], ['Glacier Appliance', 'shop'], ['Stitch Tailoring', 'shop'], ['Evergreen Yoga', 'shop'], ['Phone Fix', 'shop'], ['Bargain Barn', 'shop'], ['Halloran Jewelers', 'shop'], ['Mossy Rock Gifts', 'shop'], ['Pedal & Paddle', 'shop'], ['Framed!', 'shop'],
  ['Ketter County Credit Union', 'office'], ['Falls Family Dental', 'office'], ['Miller Tax Service', 'office'], ['Northbank Insurance', 'office'], ['Pacific Title & Escrow', 'office'], ['Halloran Realty', 'office'], ['Okafor Family Medicine', 'office'], ['Reyes & Chen, Attorneys', 'office'], ['First Cascade Bank', 'office'], ['Falls Chiropractic', 'office'], ['The Halloran Herald', 'office'], ['Summit Staffing', 'office'], ['Ketter Valley Vet', 'office'], ['Bright Smiles Orthodontics', 'office'], ['Union Hall Local 218', 'office'], ['Riverside Physical Therapy', 'office'],
];

// ---------------------------------------------------------------- cut-out atlas (4x4 tiles of 512)

export const CUT = { leafA: 0, leafB: 1, leafC: 2, fir: 3, cedar: 4, bush: 5, chain: 6, picket: 7, rail: 8, impA: 9, impB: 10, reeds: 11, lattice: 12, bark: 13, white: 14, birch: 15 };
export const cutUV = i => { const tx = i % 4, ty = Math.floor(i / 4), p = 3 / 2048; return { u0: tx / 4 + p, u1: (tx + 1) / 4 - p, v0: 1 - (ty + 1) / 4 + p, v1: 1 - ty / 4 - p }; };

export function buildCutAtlas(aniso = 8) {
  const S = 2048, T = 512, cv = makeCanvas(S), g = cv.getContext('2d'), rng = makeRng(4242);
  const tile = (i, f) => { g.save(); g.translate((i % 4) * T, Math.floor(i / 4) * T); g.beginPath(); g.rect(0, 0, T, T); g.clip(); f(); g.restore(); };
  const leafy = (hue, sat, l0, l1, n, sz) => () => {
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(48,36,24,0.9)`; g.lineWidth = rng.r(2, 5); g.beginPath(); g.moveTo(256 + rng.r(-30, 30), 256 + rng.r(-30, 30)); g.lineTo(256 + rng.r(-200, 200), 256 + rng.r(-200, 200)); g.stroke(); }
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.283, rad = Math.pow(rng(), 0.5) * 232, x = 256 + Math.cos(a) * rad, y = 256 + Math.sin(a) * rad * 0.94, depth = k / n;
      const L = lerpN(l0, l1, depth * depth) + rng.r(-5, 5), s = sz * rng.r(0.7, 1.3);
      g.save(); g.translate(x, y); g.rotate(rng() * 6.283);
      g.fillStyle = `hsl(${hue + rng.r(-9, 9)},${sat + rng.r(-8, 8)}%,${L}%)`; g.beginPath(); g.ellipse(0, 0, s, s * 0.52, 0, 0, 7); g.fill();
      g.strokeStyle = `hsla(${hue},${sat}%,${L * 0.6}%,0.7)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); g.restore();
    }
  };
  // Broadleaf card: a spray of twigs fanning up from the bottom edge, each carrying pointed leaves, with open sky
  // between them, so a crown built from many small cards reads as foliage rather than as squares.
  const spray = (hue, sat, l0, l1, sz) => () => {
    const leaf = (x, y, ang, s, L) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = `hsl(${hue + rng.r(-10, 10)},${sat + rng.r(-8, 8)}%,${L}%)`; g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.66, s * 1.15, 0); g.quadraticCurveTo(0, s * 0.66, -s, 0); g.fill(); g.strokeStyle = `hsla(${hue},${sat}%,${L * 0.55}%,0.8)`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); g.restore(); };
    for (let pass = 0; pass < 2; pass++) for (let t = 0; t < 4; t++) {
      const len = rng.r(300, 440) * (pass ? 0.72 : 1); let x = 256 + (t - 1.5) * 30, y = 502, a = -Math.PI / 2 + (t - 1.5) * 0.46 + (pass ? 0.22 : 0) + rng.r(-0.15, 0.15);
      const pts = []; g.strokeStyle = 'rgba(52,40,28,0.95)'; g.lineWidth = 3.4 - pass; g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 12; i++) { a += rng.r(-0.16, 0.16); x += Math.cos(a) * len / 12; y += Math.sin(a) * len / 12; g.lineTo(x, y); pts.push([x, y, a]); } g.stroke();
      for (const [px, py, pa] of pts) for (const sd of [-1, 1]) { if (rng.chance(0.12)) continue; const la = pa + sd * rng.r(0.6, 1.25), s = sz * rng.r(0.7, 1.2); leaf(px + Math.cos(la) * s * 1.1, py + Math.sin(la) * s * 1.1, la, s, lerpN(l0, l1, pass * 0.6 + rng() * 0.4)); }
    }
  };
  tile(CUT.leafA, spray(98, 44, 22, 42, 17)); tile(CUT.leafB, spray(80, 48, 26, 48, 18)); tile(CUT.leafC, spray(116, 36, 19, 37, 16));
  tile(CUT.bush, leafy(105, 40, 15, 34, 1100, 11));
  const bough = (hue, flat) => () => {
    const twig = (x0, y0, ang, len, wdt, L) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len; g.strokeStyle = 'rgba(40,30,22,0.9)'; g.lineWidth = wdt; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const n = Math.max(4, Math.round(len / 5));
      for (let i = 0; i < n; i++) { const t = (i + rng()) / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, nl = (flat ? 9 : 13) * (1 - t * 0.4) * rng.r(0.8, 1.2); g.strokeStyle = `hsl(${hue + rng.r(-8, 8)},${rng.r(30, 46)}%,${L + t * 9 + rng.r(-3, 4)}%)`; g.lineWidth = flat ? 4.2 : 2.6;
        for (const sd of [-1, 1]) { const na = ang + sd * (flat ? 0.5 : 0.95); g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke(); } }
    };
    for (let pass = 0; pass < 3; pass++) {
      const L = 11 + pass * 6;
      for (let i = 0; i < 30; i++) { const t = (i + rng()) / 30, x = 14 + t * 470, env = Math.pow(Math.sin(Math.PI * (0.1 + 0.86 * t)), 0.7) * (1 - t * 0.25), len = (70 + 150 * env) * rng.r(0.75, 1.1) * (1 - pass * 0.12);
        for (const sd of [-1, 1]) twig(x, 256 + sd * 3, sd * rng.r(0.55, 0.85), len, 3.2, L); }
      twig(8, 256, 0, 492, 7, L + 3);
    }
  };
  tile(CUT.fir, bough(128, false)); tile(CUT.cedar, bough(104, true));
  // Whole-conifer silhouette (far forest billboards and the core of the nearer models): drooping boughs stacked up a
  // trunk, each with a ragged needle fringe, three passes from dark to lighter.
  const impostor = (hue, slim) => () => {
    g.strokeStyle = '#2a1f17'; g.lineWidth = 9; g.beginPath(); g.moveTo(256, 510); g.lineTo(256, 30); g.stroke();
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 26; k++) {
      const t = (k + rng()) / 26, y = 8 + t * 440, hw = (10 + Math.pow(t, 0.85) * 215 * slim) * rng.r(0.7, 1.12) * (1 - pass * 0.14);
      for (const sd of [-1, 1]) {
        const drop = hw * rng.r(0.25, 0.5) + 10, x1 = 256 + sd * hw, y1 = y + drop, L = 9 + pass * 5 + rng.r(-2, 3);
        g.fillStyle = `hsl(${hue + rng.r(-8, 8)},${32 + rng.r(0, 12)}%,${L}%)`;
        g.beginPath(); g.moveTo(256, y - 8); g.quadraticCurveTo(256 + sd * hw * 0.6, y - 4, x1, y1); g.quadraticCurveTo(256 + sd * hw * 0.45, y + drop * 0.9 + 14, 256, y + 26); g.closePath(); g.fill();
        g.strokeStyle = `hsl(${hue},34%,${L + 4}%)`; g.lineWidth = 2.4;
        for (let j = 0; j < 7; j++) { const f = (j + rng()) / 7, fx = 256 + sd * hw * f, fy = y + 10 + drop * f * f + 12 * (1 - f); g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + sd * rng.r(0, 6), fy + rng.r(8, 20)); g.stroke(); }
      }
    }
  };
  tile(CUT.impA, impostor(130, 0.8)); tile(CUT.impB, impostor(112, 1.0));
  tile(CUT.chain, () => { g.strokeStyle = 'rgba(176,182,186,1)'; g.lineWidth = 2.6; for (let k = -T; k < T * 2; k += 24) { g.beginPath(); g.moveTo(k, 30); g.lineTo(k + T, T + 30); g.stroke(); g.beginPath(); g.moveTo(k, 30); g.lineTo(k - T, T + 30); g.stroke(); } g.clearRect(0, 0, T, 26); g.fillStyle = '#9aa0a4'; g.fillRect(0, 22, T, 12); g.fillRect(0, T - 14, T, 6); g.fillStyle = '#8f9599'; g.fillRect(0, 8, 14, T); g.fillRect(T - 6, 8, 6, T); });
  tile(CUT.picket, () => { g.fillStyle = '#e9e7e0'; for (let x = 4; x < T; x += 64) { g.beginPath(); g.moveTo(x, T); g.lineTo(x, 70); g.lineTo(x + 20, 40); g.lineTo(x + 40, 70); g.lineTo(x + 40, T); g.closePath(); g.fill(); } g.fillStyle = '#dedcd4'; g.fillRect(0, 150, T, 34); g.fillRect(0, 400, T, 34); });
  tile(CUT.rail, () => { g.fillStyle = '#ffffff'; for (let x = 6; x < T; x += 46) g.fillRect(x, 20, 9, T - 20); g.fillRect(0, 12, T, 22); g.fillRect(0, T - 40, T, 14); g.fillRect(0, 12, 14, T); });
  tile(CUT.reeds, () => { for (let k = 0; k < 150; k++) { const x = rng.r(20, T - 20), hgt = rng.r(180, 480), bend = rng.r(-60, 60); g.strokeStyle = `hsl(${rng.r(60, 105)},${rng.r(28, 50)}%,${rng.r(16, 40)}%)`; g.lineWidth = rng.r(2.5, 5.5); g.beginPath(); g.moveTo(x, T); g.quadraticCurveTo(x + bend * 0.2, T - hgt * 0.6, x + bend, T - hgt); g.stroke(); } });
  tile(CUT.lattice, () => { g.strokeStyle = '#ffffff'; g.lineWidth = 26; g.strokeRect(13, 13, T - 26, T - 26); g.lineWidth = 20; g.beginPath(); g.moveTo(13, 13); g.lineTo(T - 13, T - 13); g.moveTo(T - 13, 13); g.lineTo(13, T - 13); g.stroke(); });
  const bark = (base, dark, n) => () => { g.fillStyle = base; g.fillRect(0, 0, T, T); for (let k = 0; k < n; k++) { const x = rng.r(0, T), y = rng.r(-40, T), len = rng.r(40, 190); g.strokeStyle = rng.chance(0.6) ? dark : `rgba(255,255,255,${rng.r(0.03, 0.1)})`; g.lineWidth = rng.r(2, 7); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rng.r(-8, 8), y + len * 0.3, x + rng.r(-8, 8), y + len * 0.7, x + rng.r(-6, 6), y + len); g.stroke(); } };
  tile(CUT.bark, bark('#4a3b2e', 'rgba(22,16,12,0.75)', 420));
  tile(CUT.white, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, T, T); });
  tile(CUT.birch, () => { g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, T, T); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(30,28,26,${rng.r(0.5, 0.95)})`; const x = rng.r(0, T), y = rng.r(0, T); g.beginPath(); g.ellipse(x, y, rng.r(10, 44), rng.r(2, 6), 0, 0, 7); g.fill(); } });
  // Canvas pixels with zero alpha come back black; give them their tile's average colour instead (and flip the rows)
  // so that mip levels and alpha-to-coverage edges stay leaf-coloured rather than going dark.
  const src = g.getImageData(0, 0, S, S).data, out = new Uint8Array(S * S * 4);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = ty * T; y < (ty + 1) * T; y += 3) for (let x = tx * T; x < (tx + 1) * T; x += 3) { const i = (y * S + x) * 4; if (src[i + 3] > 200) { r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++; } }
    if (n) { r /= n; gg /= n; b /= n; }
    for (let y = ty * T; y < (ty + 1) * T; y++) { const row = (S - 1 - y) * S; for (let x = tx * T; x < (tx + 1) * T; x++) { const i = (y * S + x) * 4, o = (row + x) * 4, a = src[i + 3]; if (a < 8) { out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = 0; } else { const k = a / 255; out[o] = src[i] * k + r * (1 - k); out[o + 1] = src[i + 1] * k + gg * (1 - k); out[o + 2] = src[i + 2] * k + b * (1 - k); out[o + 3] = a; } } }
  }
  const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
const lerpN = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- materials

export function makeSignMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = s => {
    s.uniforms.uNight = U.uNight; s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCol; varying vec4 vCol;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCol=aCol;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCol; uniform float uNight,uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float glow=vCol.r*2.6; float fl=1.0; if(vCol.g>0.5){ float t=uTime*9.0+vCol.b*40.0; fl=0.82+0.18*step(0.12,fract(sin(floor(t))*43758.5)); }
          totalEmissiveRadiance+=diffuseColor.rgb*glow*fl*mix(0.12,1.0,smoothstep(0.1,0.5,uNight)); }`);
  };
  return m;
}

// Alpha-tested foliage / fences. aCol.rgb tints; aCol.a > 0.5 marks foliage (soft normals, light through the leaves).
export function makeCutMaterial(tex, sh, billboard = false) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, alphaToCoverage: true });
  patchWet(m, { puddles: 0 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    Object.assign(s.uniforms, { uLampMap: sh.uLampMap, uLampRect: sh.uLampRect, uNight: U.uNight });
    // (map_fragment below: far foliage samples tiny mip levels that blend neighbouring atlas tiles, so it settles on a plain leaf colour)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCol; varying vec4 vCol;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCol=aCol;' + (billboard ? '\n#ifdef USE_INSTANCING\n{ vec2 tc=cameraPosition.xz-instanceMatrix[3].xz; float tl=max(length(tc),1e-3); vec2 rt=vec2(tc.y,-tc.x)/tl; transformed=vec3(rt.x*position.x,position.y,rt.y*position.x); }\n#endif' : ''));
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCol; uniform sampler2D uLampMap; uniform vec4 uLampRect; uniform float uNight;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=pow(vCol.rgb,vec3(2.2)); { vec2 tx=vMapUv*2048.0; float lod=0.5*log2(max(min(dot(dFdx(tx),dFdx(tx)),dot(dFdy(tx),dFdy(tx))),1.0)); diffuseColor.a*=1.0+0.1*clamp(lod,0.0,6.0); if(vCol.a>0.5){ float k=vCol.a>0.9?smoothstep(4.3,6.2,lod):smoothstep(1.2,3.0,lod); diffuseColor.rgb=mix(diffuseColor.rgb,pow(vCol.rgb,vec3(2.2))*vec3(0.05,0.085,0.035),k); if(vCol.a>0.9) diffuseColor.a=mix(diffuseColor.a,max(diffuseColor.a,0.6),k); } }')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nif(vCol.a>0.5){ normal=normalize(vNormal); nonPerturbedNormal=normal; } else { float lum=dot(texture2D(map,vMapUv).rgb,vec3(0.333)); vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition); vec3 r1=cross(sy,normal), r2=cross(normal,sx); float det=dot(sx,r1); vec3 gr=sign(det)*(dFdx(lum)*r1+dFdy(lum)*r2)*2.2; normal=normalize(abs(det)*normal-gr+normal*1e-6); }')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { vec3 lm=texture2D(uLampMap,(vWetPos.xz-uLampRect.xy)*uLampRect.zw).rgb; lm*=lm;
          reflectedLight.indirectDiffuse+=lm*(uNight*(1.0-smoothstep(2.0,16.0,vWetPos.y))*1.6)*diffuseColor.rgb; if(vCol.a>0.5){ reflectedLight.indirectSpecular*=0.06; reflectedLight.directSpecular*=0.25; }
          #if NUM_DIR_LIGHTS > 0
          if(vCol.a>0.5){ float tr=pow(max(dot(-normalize(vViewPosition),directionalLights[0].direction),0.0),3.0); reflectedLight.directDiffuse+=directionalLights[0].color*diffuseColor.rgb*(0.10+0.35*tr)*0.3183; }
          #endif
        }`);
  };
  m.customProgramCacheKey = () => 'town-cut' + (billboard ? '-bb' : '');
  return m;
}
