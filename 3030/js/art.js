// Character art. Portraits for the cinema scenes are painted from a union of ellipsoid
// heightfields: each pixel gets a surface normal, is lit from the upper left, quantised onto a
// 5-step ramp with Bayer dither, and back-lit with a neon rim. That is the Tecmo cut-scene look:
// heavy shading, hard rim light, black outline. Small gameplay sprites are string art.
import { canvas, P, RAMP, rampAt, rect, px, poly, ellipse, outline, spr, mix, line, ring } from './gfx.js';

// ----------------------------------------------------------------- blob shader
const LIGHT = (() => { const v = [-0.5, -0.62, 0.78], l = Math.hypot(...v); return v.map(x => x / l); })();
export function blob(g, parts, ramp, o = {}) {
  const L = o.L || LIGHT, amb = o.amb ?? 0.14, rimT = o.rimT ?? 0.62, bias = o.bias ?? 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of parts) { x0 = Math.min(x0, p.x - p.rx); x1 = Math.max(x1, p.x + p.rx); y0 = Math.min(y0, p.y - p.ry); y1 = Math.max(y1, p.y + p.ry); }
  const hAt = (x, y) => {
    let h = -1;
    for (const p of parts) {
      const dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry, d = dx * dx + (p.ey ? Math.abs(dy) ** p.ey : dy * dy);
      if (d < 1) { const v = (p.h ?? Math.min(p.rx, p.ry)) * Math.sqrt(1 - d) + (p.z || 0); if (v > h) h = v; }
    }
    return h;
  };
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const cx = x + 0.5, cy = y + 0.5, h = hAt(cx, cy);
    if (h < 0) continue;
    if (o.clip && !o.clip(x, y)) continue;
    const z = v => Math.max(0, v);
    const gx = (z(hAt(cx + 1, cy)) - z(hAt(cx - 1, cy))) / 2, gy = (z(hAt(cx, cy + 1)) - z(hAt(cx, cy - 1))) / 2;
    let nx = -gx, ny = -gy, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    let v = amb + Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) * (1 - amb) + bias;
    let col = rampAt(ramp, v, x, y);
    if (o.rim && nx > rimT) col = o.rim;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
}

// Paint neon rim light on the right-hand edge of everything opaque (2px), then outline.
function rimPass(c, color, side = 1) {
  const g = c.getContext('2d'), { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  g.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x + side, y) || (!on(x + 2 * side, y) && (x + y) % 2 === 0)) g.fillRect(x, y, 1, 1);
  }
}

// ----------------------------------------------------------------- busts
// spec: { skin: 'D'|'M'|'L'|ramp, hair, hairRamp, eyes, brow, mouth, outfit, cloth, rim, beard, extras: [] }
const BW = 96, BH = 112, HX = 48, HY = 42;
const bustCache = new Map();
export function bust(spec, talk = false) {
  const key = JSON.stringify(spec) + talk;
  let c = bustCache.get(key);
  if (!c) { c = paintBust(spec, talk); bustCache.set(key, c); }
  return c;
}

function paintBust(sp, talk) {
  const [c, g] = canvas(BW, BH);
  const sk = typeof sp.skin === 'string' ? RAMP['skin' + sp.skin] : sp.skin || RAMP.skinM;
  const hr = sp.hairRamp || [P.ink, '#1a1214', '#2c1e1e', '#46302a', '#6a4a3a'];
  const cl = sp.cloth || RAMP.cloth;
  const ex = new Set(sp.extras || []);
  const robot = sp.robot;

  // Behind the head: long hair, afros, hoods.
  if (sp.hair === 'afro') blob(g, [{ x: HX, y: HY - 6, rx: 31, ry: 28, h: 26 }], hr);
  if (sp.hair === 'long') blob(g, [{ x: HX, y: HY + 14, rx: 28, ry: 38, h: 20 }], hr, { clip: (x, y) => y < 96 });
  if (sp.hair === 'bun') blob(g, [{ x: HX + 2, y: HY - 26, rx: 11, ry: 9, h: 10 }, { x: HX, y: HY + 8, rx: 25, ry: 30, h: 18 }], hr, { clip: (x, y) => y < 80 });
  if (sp.hair === 'hood' || sp.hair === 'koala') {
    blob(g, [{ x: HX, y: HY + 4, rx: 27, ry: 31, h: 24 }, { x: HX, y: HY - 18, rx: 18, ry: 16, h: 18, z: 4 }], cl);
    if (sp.hair === 'koala') {
      for (const s of [-1, 1]) { const ex = HX + s * 29, ey = HY - 14; blob(g, [{ x: ex, y: ey, rx: 15, ry: 13, h: 10 }], RAMP.steel, { clip: (x, y) => ((x - ex) / 15) ** 2 + ((y - ey) / 13) ** 2 < 0.82 + ((x * 7 + y * 13) % 5) * 0.05 }); ellipse(g, ex + s * 2, ey + 1, 8, 7, P.s4); for (let i = 0; i < 14; i++) px(g, ex + s * 2 + Math.round(Math.cos(i) * 7), ey + 1 + Math.round(Math.sin(i * 1.7) * 6), P.white); }
    }
  }

  // Torso, then neck, then head.
  paintTorso(g, sp.outfit || 'jacket', cl, sk);
  blob(g, [{ x: HX, y: HY + 27, rx: 9, ry: 11, h: 8 }], robot ? RAMP.steel : sk, { bias: -0.18 });
  const headParts = [
    { x: HX, y: HY - 4, rx: 19, ry: 20, h: 19 },
    { x: HX, y: HY + 6, rx: 17, ry: 17, h: 19, ey: 4 },
    { x: HX, y: HY + 19, rx: 8, ry: 4.5, h: 5, z: 12 },
    { x: HX - 8, y: HY + 8, rx: 8, ry: 7, h: 6, z: 12 }, { x: HX + 8, y: HY + 8, rx: 8, ry: 7, h: 6, z: 12 },
    { x: HX, y: HY + 7, rx: 2.6, ry: 6, h: 4, z: 18 },
    { x: HX, y: HY - 1, rx: 14, ry: 2.6, h: 2, z: 18 },
    { x: HX - 19.5, y: HY + 4, rx: 3, ry: 5.5, h: 4, z: 6 }, { x: HX + 19.5, y: HY + 4, rx: 3, ry: 5.5, h: 4, z: 6 },
  ];
  blob(g, headParts, robot ? (sp.skinRamp || RAMP.steel) : sk);

  // Hair on top.
  const hairline = x => 21 + Math.max(0, Math.abs(x - HX) - 9) * 0.95;
  if (sp.hair === 'short' || sp.hair === 'slick' || sp.hair === 'afro' || sp.hair === 'long' || sp.hair === 'bun') {
    blob(g, [{ x: HX, y: HY - 6, rx: 20.5, ry: 20, h: 21 }], hr, { clip: (x, y) => y < hairline(x) + (sp.hair === 'long' ? 2 : 0) });
    if (sp.hair === 'slick') for (let i = 0; i < 9; i++) px(g, HX - 6 + i, HY - 24 + (i >> 2), hr[4]);
    if (sp.hair === 'long') for (const s of [-1, 1]) blob(g, [{ x: HX + s * 18, y: HY + 10, rx: 6, ry: 22, h: 6, z: 14 }], hr, { clip: (x, y) => y > HY - 14 });
  }
  if (sp.hair === 'flat') blob(g, [{ x: HX, y: HY - 14, rx: 20, ry: 17, h: 20 }], hr, { clip: (x, y) => y > HY - 33 && y < hairline(x) });
  if (sp.hair === 'beanie') {
    blob(g, [{ x: HX, y: HY - 9, rx: 22, ry: 19, h: 20 }, { x: HX, y: HY - 29, rx: 5, ry: 4, h: 4, z: 14 }], hr, { clip: (x, y) => y < HY - 7 });
    rect(g, HX - 21, HY - 11, 43, 4, hr[1]); for (let x = HX - 21; x < HX + 22; x += 2) px(g, x, HY - 10, hr[3]);
  }
  if (sp.hair === 'mohawk') blob(g, [{ x: HX, y: HY - 22, rx: 5, ry: 16, h: 8, z: 14 }], hr);
  if (sp.hair === 'cap') {
    blob(g, [{ x: HX, y: HY - 10, rx: 21, ry: 16, h: 18 }], cl, { clip: (x, y) => y < HY - 9 });
    poly(g, [[HX - 21, HY - 10], [HX + 21, HY - 10], [HX + 30, HY - 5], [HX - 4, HY - 4]], cl[1]);
  }
  if (sp.hair === 'hood' || sp.hair === 'koala') {
    // Hood rim framing the face.
    blob(g, [{ x: HX, y: HY + 4, rx: 27, ry: 31, h: 24 }, { x: HX, y: HY - 18, rx: 18, ry: 16, h: 18, z: 4 }], cl, { clip: (x, y) => ((x - HX) / 20) ** 2 + ((y - HY - 3) / 24) ** 2 > 1 && y < 78 });
    for (const a of [-1.25, 1.25]) line(g, HX + Math.sin(a) * 23, HY - 4, HX + Math.sin(a) * 25, HY + 22, cl[1]);
  }
  if (sp.hair === 'dome') blob(g, [{ x: HX, y: HY - 8, rx: 21, ry: 19, h: 22 }], RAMP.steel, { clip: (x, y) => y < HY - 6, rim: P.cyan });

  // Beard.
  if (sp.beard === 'white') blob(g, [{ x: HX, y: HY + 18, rx: 17, ry: 15, h: 12, z: 6 }, { x: HX, y: HY + 30, rx: 11, ry: 12, h: 9, z: 4 }], [P.s1, P.s2, P.s3, P.s4, P.white], { clip: (x, y) => y > HY + 9 - (Math.abs(x - HX) < 6 ? 0 : 3) });
  if (sp.beard === 'goatee') blob(g, [{ x: HX, y: HY + 21, rx: 5, ry: 5, h: 4, z: 14 }], hr);

  // Face.
  paintFace(g, sp, sk, talk);

  // Eyewear and extras.
  const ey = HY + 4;
  if (sp.eyes === 'shades') {
    poly(g, [[HX - 15, ey - 3], [HX + 15, ey - 3], [HX + 14, ey + 2], [HX + 3, ey + 3], [HX, ey], [HX - 3, ey + 3], [HX - 14, ey + 2]], P.ink);
    rect(g, HX - 17, ey - 3, 34, 1, P.s1);
    for (let i = 0; i < 4; i++) { px(g, HX - 11 + i, ey - 2 + i, P.s3); px(g, HX + 5 + i, ey - 2 + i, P.s2); }
    px(g, HX + 10, ey - 1, P.white);
  }
  if (sp.eyes === 'visor') {
    for (let y = ey - 4; y <= ey + 3; y++) for (let x = HX - 19; x <= HX + 19; x++) { const t = (y - ey + 4) / 7; px(g, x, y, rampAt(sp.visorRamp || RAMP.sea, 0.9 - t * 0.7 + (x - HX) * 0.006, x, y)); }
    rect(g, HX - 19, ey - 5, 39, 1, P.s3); rect(g, HX - 19, ey + 4, 39, 1, P.s1);
    for (let i = 0; i < 6; i++) px(g, HX - 12 + i * 2, ey - 3 + (i >> 1), P.white);
  }
  if (sp.eyes === 'goggles' || ex.has('goggles')) {
    const gy = HY - 16;
    rect(g, HX - 21, gy - 1, 42, 3, P.brown1);
    for (const s of [-1, 1]) { ellipse(g, HX + s * 8, gy, 7, 6, P.gold1); ellipse(g, HX + s * 8, gy, 5, 4, P.teal); px(g, HX + s * 8 - 2, gy - 2, P.ice); px(g, HX + s * 8 - 1, gy - 2, P.white); }
  }
  if (sp.eyes === 'glasses') for (const s of [-1, 1]) { ring(g, HX + s * 8 + 0.5, ey + 0.5, 5.5, P.ink); px(g, HX + s * 8 - 2, ey - 2, P.white); }
  if (sp.eyes === 'monocle') { ring(g, HX + 8.5, ey + 0.5, 5.5, P.gold2); line(g, HX + 13, ey + 3, HX + 17, ey + 30, P.gold1); px(g, HX + 6, ey - 2, P.white); }
  if (sp.eyes === 'cyber') { rect(g, HX + 3, ey - 4, 13, 8, P.s1); rect(g, HX + 4, ey - 3, 11, 1, P.s3); ellipse(g, HX + 9, ey, 3, 2.5, P.red); px(g, HX + 9, ey - 1, P.pink); }
  if (ex.has('headphones')) {
    for (let a = Math.PI * 1.02; a <= Math.PI * 1.98; a += 0.02) { const x = HX + Math.cos(a) * 22, y = HY + 2 + Math.sin(a) * 27; rect(g, x - 1, y - 1, 3, 3, P.s1); px(g, x, y - 1, P.s3); }
    for (const s of [-1, 1]) blob(g, [{ x: HX + s * 21, y: HY + 4, rx: 6, ry: 9, h: 6, z: 16 }], sp.phoneRamp || RAMP.neon);
  }
  if (ex.has('earring')) { px(g, HX - 20, HY + 11, P.gold3); px(g, HX - 20, HY + 12, P.gold2); }
  if (ex.has('chain')) for (let a = 0; a <= 1; a += 0.04) { const x = HX - 16 + a * 32, y = 88 + Math.sin(a * Math.PI) * 12; px(g, x, y, (a * 25 | 0) % 2 ? P.gold3 : P.gold2); }
  if (ex.has('scar')) { line(g, HX - 13, ey - 7, HX - 8, ey + 5, mix(sk[1], P.red, 0.3)); }
  if (ex.has('antenna')) { line(g, HX + 12, HY - 20, HX + 18, HY - 34, P.s3); ellipse(g, HX + 18, HY - 35, 2, 2, P.red); }
  if (ex.has('bowtie')) { poly(g, [[HX - 7, 80], [HX, 83], [HX - 7, 86]], P.red); poly(g, [[HX + 7, 80], [HX, 83], [HX + 7, 86]], P.red); rect(g, HX - 1, 82, 3, 3, P.blood); }

  rimPass(c, sp.rim || P.cyan);
  outline(c, P.ink);
  return c;
}

function paintTorso(g, kind, cl, sk) {
  const parts = [{ x: HX - 24, y: 100, rx: 22, ry: 15, h: 13 }, { x: HX + 24, y: 100, rx: 22, ry: 15, h: 13 }, { x: HX, y: 99, rx: 26, ry: 25, h: 19 }, { x: HX, y: 82, rx: 21, ry: 9, h: 8, z: 8 }];
  const clip = (x, y) => y < BH;
  if (kind === 'armor') {
    blob(g, parts, RAMP.steel, { clip });
    for (const s of [-1, 1]) blob(g, [{ x: HX + s * 30, y: 88, rx: 14, ry: 9, h: 9, z: 10 }], RAMP.steel, { clip });
    rect(g, HX - 10, 92, 20, 2, P.s1); ellipse(g, HX, 98, 4, 4, P.cyan); px(g, HX - 1, 97, P.ice);
    return;
  }
  const ramp = kind === 'coat' ? [P.s1, P.s2, P.s3, P.s4, P.white] : kind === 'robe' ? RAMP.violet : kind === 'suit' ? [P.ink, P.s0, P.s1, P.s2, P.s3] : kind === 'tux' ? [P.ink, P.ink, P.s0, P.s1, P.s2] : cl;
  blob(g, parts, ramp, { clip });
  if (kind === 'jacket' || kind === 'hoodie') {
    poly(g, [[HX - 9, 80], [HX + 9, 80], [HX, 100]], mix(ramp[1], P.ink, 0.3));
    line(g, HX, 100, HX, 111, ramp[1]);
    if (kind === 'jacket') { poly(g, [[HX - 9, 80], [HX - 16, 86], [HX - 3, 104]], ramp[3]); poly(g, [[HX + 9, 80], [HX + 16, 86], [HX + 3, 104]], ramp[2]); }
    if (kind === 'hoodie') { line(g, HX - 4, 84, HX - 5, 98, P.s3); line(g, HX + 4, 84, HX + 5, 98, P.s3); }
  }
  if (kind === 'tux' || kind === 'suit') {
    poly(g, [[HX - 10, 79], [HX + 10, 79], [HX, 106]], P.white);
    poly(g, [[HX - 10, 79], [HX - 2, 106], [HX - 15, 90]], ramp[2]); poly(g, [[HX + 10, 79], [HX + 2, 106], [HX + 15, 90]], ramp[1]);
    if (kind === 'suit') { poly(g, [[HX - 2, 82], [HX + 2, 82], [HX + 3, 100], [HX, 104], [HX - 3, 100]], P.red); }
  }
  if (kind === 'coat') { poly(g, [[HX - 9, 80], [HX + 9, 80], [HX, 98]], P.teal); line(g, HX, 98, HX, 111, P.s2); rect(g, HX + 10, 98, 7, 1, P.s2); }
  if (kind === 'robe') { for (const s of [-1, 1]) line(g, HX + s * 7, 80, HX + s * 2, 111, P.gold2); poly(g, [[HX - 7, 80], [HX + 7, 80], [HX, 90]], sk[2]); }
  if (kind === 'sweater') { blob(g, [{ x: HX, y: 80, rx: 11, ry: 5, h: 4, z: 14 }], ramp); for (let y = 90; y < 111; y += 4) for (let x = HX - 20; x < HX + 20; x += 4) px(g, x + (y >> 2) % 2 * 2, y, ramp[3]); }
}

function paintFace(g, sp, sk, talk) {
  const ey = HY + 4, dark = sk[0], mid = sk[1];
  const eyes = sp.eyes || 'normal';
  if (!sp.robot && eyes !== 'visor' && eyes !== 'shades') {
    for (const s of [-1, 1]) {
      if (eyes === 'cyber' && s === 1) continue;
      const x = HX + s * 8;
      if (eyes === 'closed') { rect(g, x - 3, ey, 7, 1, dark); continue; }
      rect(g, x - 3, ey - 1, 7, 3, P.cream);
      rect(g, x - (s < 0 ? 0 : 1), ey - 1, 2, 3, sp.iris || P.brown1);
      px(g, x - (s < 0 ? 0 : 1), ey - 1, P.white);
      rect(g, x - 4, ey - 2, 9, 1, dark);
      px(g, x + 4 * s, ey - 1, dark);
      rect(g, x - 3, ey + 2, 7, 1, mid);
    }
  }
  if (sp.robot) {
    for (const s of [-1, 1]) { rect(g, HX + s * 8 - 4, ey - 2, 9, 5, P.ink); rect(g, HX + s * 8 - 3, ey - 1, 7, 3, sp.eyeCol || P.red); px(g, HX + s * 8 - 2, ey - 1, P.white); }
    for (let i = 0; i < 5; i++) rect(g, HX - 7 + i * 3, HY + 17, 2, talk ? 4 : 2, P.ink);
    return;
  }
  // Brows.
  const bw = sp.brow || 'flat', by = ey - 5;
  for (const s of [-1, 1]) {
    const x = HX + s * 8;
    if (eyes === 'visor') break;
    for (let i = -4; i <= 4; i++) {
      const dy = bw === 'angry' ? Math.round((i * s) * 0.45) : bw === 'up' ? -Math.round((i * s) * 0.4) - 1 : bw === 'sad' ? -Math.round((i * s) * 0.45) : 0;
      px(g, x + i, by + dy, sp.browCol || P.ink); px(g, x + i, by + dy + 1, sp.browCol || P.ink);
    }
  }
  // Mouth.
  const my = HY + 19;
  const m = talk ? 'open' : sp.mouth || 'line';
  if (m === 'line') { rect(g, HX - 5, my, 11, 1, dark); rect(g, HX - 3, my + 2, 7, 1, sk[3]); }
  if (m === 'smirk') { rect(g, HX - 5, my, 9, 1, dark); px(g, HX + 4, my - 1, dark); px(g, HX + 5, my - 2, dark); rect(g, HX - 3, my + 2, 7, 1, sk[3]); }
  if (m === 'frown') { rect(g, HX - 4, my, 9, 1, dark); px(g, HX - 5, my + 1, dark); px(g, HX + 5, my + 1, dark); }
  if (m === 'grin') { rect(g, HX - 7, my - 1, 15, 4, dark); rect(g, HX - 6, my - 1, 13, 2, P.white); rect(g, HX - 4, my + 2, 9, 1, P.red); }
  if (m === 'open') { ellipse(g, HX, my + 1, 4.5, 2.8, dark); rect(g, HX - 3, my - 1, 7, 1, P.cream); rect(g, HX - 2, my + 2, 5, 1, P.red); }
  if (m === 'o') { ellipse(g, HX, my + 1, 2.5, 3, dark); }
  if (sp.blush) { for (const s of [-1, 1]) for (let i = 0; i < 4; i++) px(g, HX + s * 11 + i - 2, ey + 6 + (i % 2), mix(sk[3], P.pink, 0.6)); }
}

// ----------------------------------------------------------------- the cast
export const CAST = {
  deltron: { name: 'DELTRON ZERO', skin: 'D', hair: 'hood', cloth: RAMP.cloth, eyes: 'shades', brow: 'angry', mouth: 'line', outfit: 'hoodie', rim: P.cyan, extras: ['headphones'], phoneRamp: RAMP.fire },
  automator: { name: 'THE AUTOMATOR', skin: 'M', hair: 'short', eyes: 'normal', brow: 'flat', mouth: 'smirk', outfit: 'coat', rim: P.magenta, extras: ['goggles'] },
  dj: { name: 'THE DJ', skin: 'L', hair: 'beanie', hairRamp: RAMP.green, cloth: [P.ink, P.s0, P.s1, P.s2, P.s3], eyes: 'normal', brow: 'up', mouth: 'grin', outfit: 'hoodie', rim: P.lime, extras: ['headphones'], phoneRamp: RAMP.green },
  announcer: { name: 'ANNOUNCER', skin: 'L', hair: 'slick', hairRamp: [P.ink, P.brown0, P.brown1, P.brown2, P.brown3], eyes: 'normal', brow: 'up', mouth: 'grin', outfit: 'tux', rim: P.amber, extras: ['bowtie'] },
  rival: { name: 'MC KILOWATT', robot: true, skinRamp: RAMP.steel, hair: 'none', outfit: 'armor', rim: P.red, eyeCol: P.red, extras: ['antenna'] },
  love: { name: 'NOVA', skin: 'M', hair: 'long', hairRamp: [P.ink, P.navy, P.violet, P.purple, P.pink], eyes: 'normal', brow: 'flat', mouth: 'smirk', outfit: 'jacket', cloth: RAMP.red, rim: P.pink, extras: ['earring'], blush: true, iris: P.violet },
  cleofis: { name: 'CLEOFIS RANDOLPH', skin: 'D', hair: 'bald', beard: 'white', eyes: 'glasses', brow: 'flat', mouth: 'line', outfit: 'robe', rim: P.gold2 },
  anchor: { name: 'NEWS ANCHOR', skin: 'L', hair: 'slick', hairRamp: [P.ink, P.gold0, P.gold1, P.gold2, P.gold3], eyes: 'normal', brow: 'flat', mouth: 'grin', outfit: 'suit', rim: P.ice },
  critic: { name: 'THE CRITIC', skin: 'L', hair: 'short', hairRamp: [P.ink, P.s1, P.s2, P.s3, P.s4], eyes: 'glasses', brow: 'up', mouth: 'line', outfit: 'sweater', cloth: RAMP.red, rim: P.amber },
  professor: { name: 'PROF. BRYMAR', skin: 'M', hair: 'short', hairRamp: [P.s0, P.s1, P.s2, P.s3, P.s4], eyes: 'glasses', brow: 'flat', mouth: 'line', outfit: 'suit', rim: P.lime, extras: ['bowtie'] },
  banker: { name: 'THE CHAIRMAN', skin: 'L', hair: 'slick', hairRamp: [P.s0, P.s1, P.s2, P.s3, P.s4], eyes: 'monocle', brow: 'angry', mouth: 'smirk', outfit: 'suit', rim: P.red },
  citizen: { name: 'CITIZEN', skin: 'M', hair: 'cap', cloth: RAMP.violet, eyes: 'visor', visorRamp: RAMP.neon, brow: 'flat', mouth: 'frown', outfit: 'jacket', rim: P.magenta },
  pilot: { name: 'DELTRON ZERO', skin: 'D', hair: 'dome', eyes: 'visor', visorRamp: RAMP.fire, mouth: 'line', outfit: 'armor', rim: P.orange, extras: [] },
};

// ----------------------------------------------------------------- small sprites
const DP = { k: P.ink, h: '#2b2f4a', H: '#454b72', s: '#5e3822', S: '#8a5634', g: P.ink, o: P.orange, O: P.amber, c: P.cyan, j: '#22274a', J: '#3a4170', p: '#1b1d2c', w: P.white, r: P.red };
// Deltron, side view, 14x24: idle, walk A, walk B, jump.
export const DELTRON = spr(`
....hhhhh.....
...hHHHHHh....
..ohHssssHo...
..OhsggggsO...
..ohsSSSShh...
...hhssshhh...
....jjjjjj....
...jJJJJJJj...
..jJJJcJJJJj..
..jJJJcJJJsj..
..sjJJcJJJjs..
..s.jJcJJj.s..
....jjjjjj....
....pppppp....
....pp..pp....
....pp..pp....
....pp..pp....
...kkk..kkk...
~
....hhhhh.....
...hHHHHHh....
..ohHssssHo...
..OhsggggsO...
..ohsSSSShh...
...hhssshhh...
....jjjjjj....
...jJJJJJJj...
..jJJJcJJJJj..
..jJJJcJJJsj..
...sJJcJJj.s..
....jJcJJj....
....jjjjjj....
...ppp..pp....
..pp.....pp...
.pp.......pp..
kkk.......kkk.
..............
~
....hhhhh.....
...hHHHHHh....
..ohHssssHo...
..OhsggggsO...
..ohsSSSShh...
...hhssshhh...
....jjjjjj....
...jJJJJJJj...
..jJJJcJJJJj..
..jJJJcJJJsj..
..sjJJcJJj....
....jJcJJjs...
....jjjjjj....
.....pppp.....
.....pp.pp....
....pp...pp...
....kkk..kkk..
..............
~
....hhhhh.....
...hHHHHHh....
..ohHssssHo...
..OhsggggsO..s
..ohsSSSShh.s.
...hhssshhhs..
....jjjjjjj...
...jJJJJJJj...
s.jJJJcJJJJj..
.sjJJJcJJJj...
..jJJJcJJJj...
....jJcJJj....
....jjjjjj....
...pppppppp...
..pp.....pp...
..kk......kk..
..............
..............
`, DP, { outline: true, frames: true });

export const HEART = spr(`
.rr.rr.
rRRrRRr
rRwRRRr
rRRRRRr
.rRRRr.
..rRr..
...r...
`, { r: P.blood, R: P.red, w: P.pink }, { outline: true });

export const VINYL = (() => {
  const [c, g] = canvas(16, 16);
  ellipse(g, 8, 8, 7.5, 7.5, P.ink);
  for (const r of [6.5, 5, 3.6]) ring(g, 8, 8, r, '#262338');
  ellipse(g, 8, 8, 2.6, 2.6, P.red); px(g, 8, 8, P.ink); px(g, 5, 4, P.s2); px(g, 4, 5, P.s2);
  return c;
})();

// The mic: small icon used in HUDs.
export const MIC = spr(`
.sss.
sSwSs
sSSSs
.sss.
..k..
..k..
.kkk.
`, { s: P.s1, S: P.s3, w: P.white, k: P.s2 }, { outline: true });
