// Jetskis on the lake at the end of the day. No laps and no clock: three minutes of afternoon
// sliding into a long golden sunset, a friend for company, then the skis come out.
import { rect, ellipse, poly, shade, mix, dith, canvas, outline, panel } from '../gfx.js';
import { text } from '../font.js';
import { PEOPLE, TEAMS } from '../data.js';
import { rename } from '../banter.js';

const WW = 3600, S0 = 2680, WH = S0 + 124, RAMP = 1800, DAY = 180, TAU = Math.PI * 2, DIRS = 24;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// The lake's edge: wobbling shores on all four sides, dead straight at the boat ramp.
const wob = (v, a, b, c) => Math.sin(v * 0.0031 + a) * 38 + Math.sin(v * 0.0083 + b) * 17 + Math.sin(v * 0.021 + c) * 6;
const shoreS = x => { const d = clamp(Math.abs(x - RAMP) / 420, 0, 1); return S0 + wob(x, 1.2, 0.4, 2) * d * d; };
const shoreN = x => 120 + wob(x, 2.1, 1.4, 0.3);
const shoreW = y => 120 + wob(y, 0.7, 2.7, 1.1);
const shoreE = y => WW - 120 + wob(y, 4.1, 0.2, 2.2);

const ISLANDS = [[900, 720, 170, 120], [2620, 540, 210, 140], [1720, 1100, 120, 90], [3000, 1500, 180, 130], [640, 1720, 150, 170], [1380, 1960, 95, 70], [2420, 2030, 140, 100]]
  .map(([x, y, rx, ry], i) => ({ x, y, rx, ry, a: hash(i) * 6, b: hash(i + 9) * 6, c: hash(i + 17) * 6, i }));
const isR = (s, th) => 1 + 0.14 * Math.sin(th * 3 + s.a) + 0.08 * Math.sin(th * 5 + s.b) + 0.05 * Math.sin(th * 9 + s.c);
const JETTY = { x: RAMP + 520, stem: [10, 220], head: [46, 26] };
const jettyY = () => shoreS(JETTY.x) + 16;

// Colours of the day: [time, water, trough, crest, glitter, foam, land tint, tint strength]
const KEYS = [
  [0.00, '#2b80c6', '#1f68ac', '#62b0e4', '#ffffff', '#f4fbff', '#ffffff', 0.00],
  [0.45, '#2c78b0', '#1f5f94', '#72b8d4', '#fff0c0', '#f8f4e0', '#ffb060', 0.10],
  [0.70, '#3a6e9c', '#2c5480', '#e8b070', '#ffd880', '#ffe8c0', '#ff9a40', 0.24],
  [0.86, '#6a5a8c', '#473e70', '#f09058', '#ffb060', '#ffc8a0', '#d05838', 0.36],
  [0.97, '#3a3a6e', '#27285a', '#7a5a8c', '#c87a70', '#9a84a8', '#3a2a60', 0.52],
  [1.00, '#232449', '#181a38', '#3a3a6a', '#503a60', '#6a6a90', '#1c1c48', 0.62],
];
function colours(d) {
  let i = 0;
  while (i < KEYS.length - 2 && d > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = clamp((d - a[0]) / (b[0] - a[0]), 0, 1);
  const m = n => mix(a[n], b[n], k);
  return { water: m(1), trough: m(2), crest: m(3), glitter: m(4), foam: m(5), tint: m(6), strength: a[7] + (b[7] - a[7]) * k };
}

const SHOUTS = [
  'PIP: Water is lovely. Shame about the garage.',
  "PIP: Try and keep up, Toby!",
  "PIP: Mags says if you sink it, you carry it.",
  "PIP: Look at that light. No tyres in sight.",
  "PIP: I'm jumping your wake, hold still.",
  "PIP: Big Lou would sink one of these.",
];

function skiSprites(hull, stripe, hair, jacket, skin) {
  const out = [];
  for (let i = 0; i < DIRS; i++) {
    const [c, b] = canvas(36, 36);
    const a = i / DIRS * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const P = pts => pts.map(([x, y]) => [18 + x * ca - y * sa, 18 + x * sa + y * ca]);
    const dot = (x, y, r, col) => ellipse(b, 18 + x * ca - y * sa, 18 + x * sa + y * ca, r, r, col);
    poly(b, P([[-13, -5], [3, -6], [10, -3], [14, 0], [10, 3], [3, 6], [-13, 5], [-14, 0]]), hull);
    poly(b, P([[-11, -3.5], [3, -4], [8, -2], [8, 2], [3, 4], [-11, 3.5]]), shade(hull, 0.3));
    poly(b, P([[-13, -1], [12, -1], [12, 1], [-13, 1]]), stripe);
    poly(b, P([[-10, -2.5], [-1, -2.5], [-1, 2.5], [-10, 2.5]]), '#1c1c24');
    poly(b, P([[2, -6.5], [4, -6.5], [4, 6.5], [2, 6.5]]), '#1a1a20');
    poly(b, P([[-5, -3.5], [3, -5.5], [3, -4], [-5, -1.5]]), skin);
    poly(b, P([[-5, 3.5], [3, 5.5], [3, 4], [-5, 1.5]]), skin);
    dot(-5, 0, 4.2, jacket); dot(-5, 0, 2.5, shade(jacket, 0.3));
    dot(-3.5, 0, 2.8, hair);
    outline(c, '#0a0a14');
    out.push(c);
  }
  return out;
}
function boatSprites() {
  const out = [];
  for (let i = 0; i < DIRS; i++) {
    const [c, b] = canvas(60, 60);
    const a = i / DIRS * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const P = pts => pts.map(([x, y]) => [30 + x * ca - y * sa, 30 + x * sa + y * ca]);
    poly(b, P([[-22, -9], [8, -10], [24, 0], [8, 10], [-22, 9]]), '#f4f0e6');
    poly(b, P([[-22, 7], [10, 8], [18, 4], [-22, 3]]), '#c8c0b0');
    poly(b, P([[-16, -6], [4, -6], [10, 0], [4, 6], [-16, 6]]), '#b07a4a');
    poly(b, P([[-2, -6], [3, -6], [3, 6], [-2, 6]]), '#2a3a52');
    poly(b, P([[-22, -2], [-24, -2], [-24, 2], [-22, 2]]), '#1a1a20');
    outline(c, '#0a0a14');
    out.push(c);
  }
  return out;
}
function bakeSail(col) {
  const [c, b] = canvas(52, 66);
  ellipse(b, 26, 58, 22, 7, '#f4f0e6'); ellipse(b, 26, 56, 18, 5, '#b07a4a');
  poly(b, [[26, 6], [26, 54], [46, 50]], '#f8f6ee'); poly(b, [[26, 8], [26, 54], [10, 50]], col);
  rect(b, 25, 4, 2, 52, '#3a2a20');
  outline(c, '#0a0a14');
  return c;
}
function bakePine(s) {
  const [c, b] = canvas(24 * s, 34 * s);
  const cx = 12 * s;
  ellipse(b, cx, 30 * s, 10 * s, 3 * s, 'rgba(0,0,0,0.25)');
  rect(b, cx - s, 24 * s, 2 * s, 7 * s, '#4a2e1c');
  for (let i = 0; i < 3; i++) {
    const w = (10 - i * 2) * s, y0 = (i * 7 + 2) * s;
    poly(b, [[cx, y0], [cx + w, y0 + 12 * s], [cx - w, y0 + 12 * s]], i === 2 ? '#3f8a44' : i === 1 ? '#317238' : '#265a2e');
    poly(b, [[cx, y0], [cx - w, y0 + 12 * s], [cx - 2 * s, y0 + 12 * s]], i === 2 ? '#56a050' : '#3f8a44');
  }
  outline(c, '#101a14');
  return c;
}
function bakeIsland(s, pines) {
  const m = 26, w = Math.ceil(s.rx * 2.5) + m * 2, h = Math.ceil(s.ry * 2.5) + m * 2;
  const [c, b] = canvas(w, h);
  const cx = w / 2, cy = h / 2;
  const ring = k => { const pts = []; for (let i = 0; i < 64; i++) { const th = i / 64 * TAU, r = isR(s, th) * k; pts.push([cx + Math.cos(th) * s.rx * r, cy + Math.sin(th) * s.ry * r]); } return pts; };
  poly(b, ring(1.03), '#c8ae78'); poly(b, ring(1), '#ecd8a0'); poly(b, ring(0.86), '#4f9a3a'); poly(b, ring(0.62), '#438a34');
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    const nx = (x - cx) / s.rx, ny = (y - cy) / s.ry, f = Math.hypot(nx, ny), R = isR(s, Math.atan2(ny, nx));
    if (f < R * 0.8 && dith(x / 3 | 0, y / 3 | 0, 0.3) && hash(x * 3 + y) > 0.5) rect(b, x, y, 1, 1, '#5eae48');
    if (f > R * 0.9 && f < R && hash(x * 5 + y * 2) > 0.8) rect(b, x, y, 1, 1, '#d8c088');
  }
  for (let i = 0; i < Math.round(s.rx * s.ry / 900); i++) {
    const th = hash(s.i * 13 + i) * TAU, k = 0.1 + hash(i * 3 + s.i) * 0.62, p = pines[hash(i * 7) > 0.6 ? 1 : 0];
    b.drawImage(p, Math.round(cx + Math.cos(th) * s.rx * k - p.width / 2), Math.round(cy + Math.sin(th) * s.ry * k - p.height + 6));
  }
  for (let i = 0; i < 3; i++) { const th = hash(i * 11 + s.i) * TAU, r = isR(s, th) * 0.93; const x = cx + Math.cos(th) * s.rx * r, y = cy + Math.sin(th) * s.ry * r; ellipse(b, x, y, 6, 4, '#6a6a72'); ellipse(b, x - 1, y - 1, 4, 2.5, '#8a8a94'); }
  // The second island has a cabin; its window lights up at dusk.
  if (s.i === 1) { const x = cx - 20, y = cy + 10; rect(b, x, y, 40, 22, '#6a4226'); poly(b, [[x - 4, y], [x + 20, y - 18], [x + 44, y]], '#a03828'); poly(b, [[x - 4, y], [x + 20, y - 18], [x + 20, y]], '#c04a34'); rect(b, x + 16, y + 10, 8, 12, '#3a2012'); rect(b, x + 28, y + 6, 8, 7, '#2a3a4a'); }
  return { c, cx, cy };
}
function bakeShallow(s) {
  const m = 40, w = Math.ceil(s.rx * 2.6) + m * 2, h = Math.ceil(s.ry * 2.6) + m * 2;
  const [c, b] = canvas(w, h);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - cx) / s.rx, ny = (y - cy) / s.ry, f = Math.hypot(nx, ny), R = isR(s, Math.atan2(ny, nx));
    if (f < R) continue;
    const v = 1 - (f - R) / 0.22;
    if (v > 0 && dith(x, y, v * 0.75)) rect(b, x, y, 1, 1, '#a8e8e0');
  }
  return { c, cx, cy };
}
function bakeRamp(tm) {
  const [c, b] = canvas(120, 220);
  const cx = 60;
  // concrete, sinking out of sight into the lake
  for (let y = 0; y < 220; y++) for (let x = 24; x < 96; x++) {
    const v = y > 50 ? 1 : y / 50;
    if (dith(x, y, v)) rect(b, x, y, 1, 1, y % 8 === 0 ? '#8a8a84' : (x % 24 === 0 ? '#8e8e88' : '#a6a69e'));
  }
  for (let y = 56; y < 216; y += 8) rect(b, 24, y, 72, 1, '#8a8a84');
  // double trailer: two sets of bunks side by side on one frame, drawbar forward to the hitch
  const ty = 48;
  rect(b, cx - 25, ty, 50, 38, '#14141a'); rect(b, cx - 24, ty + 1, 48, 36, '#3a3e4a');
  for (const ox of [-22, 2]) { rect(b, cx + ox, ty + 2, 20, 34, '#2a2c34'); rect(b, cx + ox + 3, ty + 2, 3, 34, '#7a5a3a'); rect(b, cx + ox + 14, ty + 2, 3, 34, '#7a5a3a'); }
  rect(b, cx - 1, ty + 1, 2, 36, '#5a5e6a');
  for (const ox of [-29, 25]) { rect(b, cx + ox, ty + 9, 5, 20, '#14141a'); rect(b, cx + ox + 1, ty + 10, 3, 18, '#34343c'); }
  rect(b, cx - 2, ty + 37, 4, 14, '#3a3e4a'); rect(b, cx - 8, ty + 36, 16, 3, '#3a3e4a'); rect(b, cx - 1, ty + 33, 2, 5, '#d42a24');
  // pickup, parked nose away from the water
  const ky = ty + 50;
  rect(b, cx - 15, ky - 3, 30, 3, '#2a2c34');
  for (const [ox, oy] of [[-18, 4], [14, 4], [-18, 40], [14, 40]]) rect(b, cx + ox, ky + oy, 4, 12, '#101014');
  rect(b, cx - 16, ky - 1, 32, 62, '#0a0a14');
  rect(b, cx - 15, ky, 30, 60, tm.c1);
  rect(b, cx - 15, ky, 30, 3, shade(tm.c1, 0.35));
  rect(b, cx - 15, ky, 3, 60, shade(tm.c1, 0.2));
  rect(b, cx + 12, ky, 3, 60, shade(tm.c1, -0.25));
  rect(b, cx - 12, ky + 4, 24, 24, '#16181e'); rect(b, cx - 11, ky + 5, 22, 22, '#2a2c34');
  for (let y = ky + 7; y < ky + 26; y += 4) rect(b, cx - 11, y, 22, 1, '#3a3e4a');
  rect(b, cx - 13, ky + 30, 26, 15, '#a8d8e8'); rect(b, cx - 13, ky + 30, 26, 2, '#e8f4f8'); rect(b, cx - 13, ky + 42, 26, 3, '#0f3a44');
  rect(b, cx - 12, ky + 45, 24, 13, shade(tm.c1, 0.1)); rect(b, cx - 15, ky + 56, 30, 3, tm.c2);
  rect(b, cx - 15, ky + 1, 3, 2, '#ff5a48'); rect(b, cx + 12, ky + 1, 3, 2, '#ff5a48');
  return c;
}
function bakeJetty() {
  const [c, b] = canvas(64, 244);
  const [w, len] = JETTY.stem, cx = 32;
  rect(b, cx - w - 1, 22, w * 2 + 2, len, '#2a1a0e');
  for (let y = 22; y < 22 + len; y += 4) { rect(b, cx - w, y, w * 2, 3, y % 12 ? '#a07848' : '#8a6438'); rect(b, cx - w, y + 3, w * 2, 1, '#6a4a28'); }
  const [hw, hh] = JETTY.head;
  rect(b, cx - hw / 2 - 5, 0, hw + 10, hh, '#2a1a0e');
  for (let y = 1; y < hh - 1; y += 4) { rect(b, cx - hw / 2 - 4, y, hw + 8, 3, y % 12 > 3 ? '#b08858' : '#9a7446'); rect(b, cx - hw / 2 - 4, y + 3, hw + 8, 1, '#6a4a28'); }
  for (const [x, y] of [[cx - hw / 2 - 5, 0], [cx + hw / 2 + 2, 0], [cx - w - 2, 60], [cx + w, 60], [cx - w - 2, 130], [cx + w, 130], [cx - w - 2, 200], [cx + w, 200]]) { rect(b, x, y, 4, 5, '#2a1a0e'); rect(b, x + 1, y + 1, 2, 2, '#c8a878'); }
  rect(b, cx + 18, 3, 8, 11, '#3a3a44'); rect(b, cx + 19, 4, 6, 3, '#6a6a78');
  return c;
}

export default function make(ctx) {
  const { g, A, W, H } = ctx;
  let objC, o, skiA, skiB, boatC, sailC, pines, isSpr, shal, rampC, jettyC, trees, buoys, boats, sails;
  let waterA, waterB, glow, step = -1, col = colours(0);
  const newSki = (x, y, a, sprites, ph) => ({ x, y, a, vx: 0, vy: 0, z: 0, vz: 0, sprites, ph, wake: [], dist: 0, hopT: 0, airLast: false });
  let p, f, spray = [], day = 0, ended = false, doneSent = false, hint = 11, cam = { x: 0, y: 0 }, t = 0;
  let mode = 'circle', modeT = 6, orb = 0, side = 1, goal = { x: RAMP, y: 2000 }, shout = null, shoutT = 16, bumpT = 0;

  function bakeWater(d) {
    col = colours(d);
    const [a, ab] = canvas(160, 120), [c, cb] = canvas(160, 120);
    rect(ab, 0, 0, 160, 120, col.water);
    for (let i = 0; i < 150; i++) { const y = Math.floor(hash(i * 2.3) * 120), x = Math.floor(hash(i * 5.1) * 160), l = 4 + Math.floor(hash(i) * 14); for (let k = 0; k < l; k++) rect(ab, (x + k) % 160, y, 1, 1, col.trough); }
    for (let i = 0; i < 90; i++) { const y = Math.floor(hash(i * 7.9 + 2) * 120), x = Math.floor(hash(i * 3.7 + 1) * 160), l = 3 + Math.floor(hash(i + 4) * 9); for (let k = 0; k < l; k++) rect(cb, (x + k) % 160, y, 1, 1, col.crest); }
    waterA = a; waterB = c;
    // the sun's reflection and its halo, re-baked as the colours change
    const [g2, gb] = canvas(200, 200);
    const fade = d > 0.9 ? clamp((1 - d) / 0.1, 0, 1) : 1;
    const low = Math.min(1, d / 0.7), rs = 0.55 + 0.45 * low; // a high sun is a small, faint patch; a low one a broad blaze
    for (const [r0, den0, c2] of [[92, 0.14, col.crest], [66, 0.28, col.crest], [42, 0.46, col.glitter]]) {
      const r = Math.round(r0 * rs), den = den0 * (0.32 + 0.68 * low);
      for (let y = 100 - r; y < 100 + r; y++) { const hw = Math.sqrt(Math.max(0, r * r - (y - 100) * (y - 100))); for (let x = Math.round(100 - hw); x < 100 + hw; x++) if (dith(x, y, den * fade)) rect(gb, x, y, 1, 1, c2); }
    }
    glow = g2;
  }
  const tile = (c, ox, oy) => { const w = c.width, h = c.height, x0 = -(((ox % w) + w) % w), y0 = -(((oy % h) + h) % h); for (let y = y0; y < H; y += h) for (let x = x0; x < W; x += w) g.drawImage(c, x, y); };

  function solidAt(x, y, pad = 0) {
    if (y > shoreS(x) - pad || y < shoreN(x) + pad || x < shoreW(y) + pad || x > shoreE(y) - pad) return true;
    for (const s of ISLANDS) {
      const nx = (x - s.x) / (s.rx + pad), ny = (y - s.y) / (s.ry + pad);
      if (nx * nx + ny * ny < 1.5 && Math.hypot(nx, ny) < isR(s, Math.atan2(ny, nx))) return true;
    }
    return false;
  }
  function bounce(s, nx, ny, strength = 0.35) {
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= (1 + strength) * vn * nx; s.vy -= (1 + strength) * vn * ny; s.vx *= 0.7; s.vy *= 0.7; if (s === p && -vn > 40 && bumpT <= 0) { A.sfx('thud'); bumpT = 0.5; } }
  }
  function collide(s) {
    const pad = 12;
    let e = shoreS(s.x) - pad; if (s.y > e) { s.y = e; bounce(s, 0, -1); }
    e = shoreN(s.x) + pad; if (s.y < e) { s.y = e; bounce(s, 0, 1); }
    e = shoreW(s.y) + pad; if (s.x < e) { s.x = e; bounce(s, 1, 0); }
    e = shoreE(s.y) - pad; if (s.x > e) { s.x = e; bounce(s, -1, 0); }
    for (const i of ISLANDS) {
      const nx = (s.x - i.x) / i.rx, ny = (s.y - i.y) / i.ry, fv = Math.hypot(nx, ny), R = isR(i, Math.atan2(ny, nx)) + 10 / Math.min(i.rx, i.ry);
      if (fv >= R || fv === 0) continue;
      s.x = i.x + nx / fv * R * i.rx; s.y = i.y + ny / fv * R * i.ry;
      const gx = nx / i.rx, gy = ny / i.ry, gl = Math.hypot(gx, gy);
      bounce(s, gx / gl, gy / gl);
    }
    // jetty: a stem and a T-head, both plain boxes
    const jy = jettyY(), top = jy - JETTY.stem[1];
    const boxes = [[JETTY.x - JETTY.stem[0], top, JETTY.x + JETTY.stem[0], jy], [JETTY.x - JETTY.head[0] / 2 - 5, top - 22, JETTY.x + JETTY.head[0] / 2 + 5, top + 4]];
    for (const [x0, y0, x1, y1] of boxes) {
      if (s.x < x0 - 7 || s.x > x1 + 7 || s.y < y0 - 7 || s.y > y1 + 7) continue;
      const dl = s.x - (x0 - 7), dr = x1 + 7 - s.x, du = s.y - (y0 - 7), dd = y1 + 7 - s.y, m = Math.min(dl, dr, du, dd);
      if (m === dl) { s.x = x0 - 7; bounce(s, -1, 0); } else if (m === dr) { s.x = x1 + 7; bounce(s, 1, 0); } else if (m === du) { s.y = y0 - 7; bounce(s, 0, -1); } else { s.y = y1 + 7; bounce(s, 0, 1); }
    }
    for (const b of [...buoys.map(q => ({ x: q.x, y: q.y, r: 7 })), ...boats.map(q => ({ x: q.x, y: q.y, r: 24 })), ...sails.map(q => ({ x: q.x, y: q.y, r: 22 }))]) {
      const dx = s.x - b.x, dy = s.y - b.y, d = Math.hypot(dx, dy), r = b.r + 8;
      if (d >= r || d === 0) continue;
      s.x = b.x + dx / d * r; s.y = b.y + dy / d * r;
      bounce(s, dx / d, dy / d, 0.5);
    }
  }

  function drive(s, thr, turn, brake, dt) {
    const fx = Math.cos(s.a), fy = Math.sin(s.a);
    let vF = s.vx * fx + s.vy * fy, vL = -s.vx * fy + s.vy * fx;
    const airborne = s.z > 0;
    if (!airborne) {
      const sp = Math.abs(vF);
      s.a = wrap(s.a + turn * dt * (1.05 + 1.65 * Math.min(1, sp / 90)));
      if (thr) vF += 230 * thr * dt;
      if (brake) vF -= (vF > 0 ? 210 : 70) * dt;
      vF -= (0.45 * vF + 0.0025 * vF * Math.abs(vF)) * dt;
      if (vF < -55) vF = -55;
      vL *= Math.exp(-2.4 * dt);
      if (Math.abs(vL) > 55) for (let i = 0; i < 2; i++) if (spray.length < 90) spray.push({ x: s.x - fx * 8 + (Math.random() - 0.5) * 8, y: s.y - fy * 8 + (Math.random() - 0.5) * 8, vx: -fy * vL * 0.35 + (Math.random() - 0.5) * 30, vy: fx * vL * 0.35 + (Math.random() - 0.5) * 30, z: 2, vz: 40 + Math.random() * 60, t: 0 });
    }
    const na = s.a, nfx = Math.cos(na), nfy = Math.sin(na);
    s.vx = nfx * vF - nfy * vL; s.vy = nfy * vF + nfx * vL;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.z > 0 || s.vz > 0) {
      s.z += s.vz * dt; s.vz -= 460 * dt;
      if (s.z <= 0) { s.z = 0; s.vz = 0; if (spray.length < 90) for (let i = 0; i < 12; i++) spray.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, z: 1, vz: 70 + Math.random() * 90, t: 0 }); if (s === p) A.sfx('thud'); }
    }
    collide(s);
    s.hopT -= dt;
    // Foam: a pair of points every few pixels, spreading out as they age.
    const sp = Math.hypot(s.vx, s.vy);
    s.dist += sp * dt;
    if (s.dist > 4 && s.z <= 0) {
      s.dist = 0;
      if (sp > 18) {
        const nx = -nfy, ny = nfx, sx = s.x - nfx * 14, sy = s.y - nfy * 14;
        s.wake.push({ x: sx, y: sy, nx, ny, age: 0, sp });
        if (s.wake.length > 320) s.wake.shift();
      }
    }
    for (const w of s.wake) w.age += dt;
    while (s.wake.length && s.wake[0].age > 5.5) s.wake.shift();
  }
  function hop(s, other) {
    const sp = Math.hypot(s.vx, s.vy);
    if (s.hopT > 0 || s.z > 0 || sp < 120) return;
    for (const pool of [other.wake, s.wake]) for (let i = 0; i < pool.length; i++) {
      const w = pool[i], minAge = pool === s.wake ? 1.5 : 0.35;
      if (w.age < minAge || w.age > 3.2) continue;
      const dx = s.x - w.x, dy = s.y - w.y;
      if (dx * dx + dy * dy > 100) continue;
      s.vz = 70 + sp * 0.3; s.z = 0.5; s.hopT = 1.1;
      if (s === p) A.sfx('whoosh');
      return;
    }
  }

  function friend(dt) {
    modeT -= dt;
    const psp = Math.hypot(p.vx, p.vy), far = Math.hypot(p.x - f.x, p.y - f.y);
    if (modeT <= 0) {
      const r = Math.random();
      if (r < 0.45) { mode = 'circle'; modeT = 7 + Math.random() * 6; }
      else if (r < 0.75) { mode = 'lead'; modeT = 7 + Math.random() * 6; const a = Math.random() * TAU, d = 400 + Math.random() * 400; goal = { x: clamp(p.x + Math.cos(a) * d, 240, WW - 240), y: clamp(p.y + Math.sin(a) * d, 240, S0 - 150) }; }
      else if (psp > 90) { mode = 'jump'; modeT = 6; side = -side; }
      else { mode = 'circle'; modeT = 5; }
    }
    let tx, ty, want = 170;
    if (mode === 'circle') { orb += dt * (0.7 + psp / 220); const r = 62 + Math.sin(t * 0.6) * 16; tx = p.x + Math.cos(orb) * r + p.vx * 0.35; ty = p.y + Math.sin(orb) * r + p.vy * 0.35; want = psp + 70; }
    else if (mode === 'lead') { tx = goal.x; ty = goal.y; want = far > 420 ? 70 : 215; if (Math.hypot(goal.x - f.x, goal.y - f.y) < 60) modeT = 0; }
    else { const fx = Math.cos(p.a), fy = Math.sin(p.a), nx = -fy, ny = fx; tx = p.x - fx * 70 + nx * side * 40; ty = p.y - fy * 70 + ny * side * 40; want = 230; if (Math.hypot(tx - f.x, ty - f.y) < 30) side = -side; }
    if (far > 520) want = 260;
    // steer, looking ahead for land and easing off round it
    let d = Math.atan2(ty - f.y, tx - f.x);
    const probe = ang => solidAt(f.x + Math.cos(ang) * 90, f.y + Math.sin(ang) * 90, 18);
    if (probe(d)) for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) if (!probe(d + off)) { d += off; break; }
    const da = wrap(d - f.a);
    const fv = Math.hypot(f.vx, f.vy);
    const turn = clamp(da * 2.4, -1, 1);
    const thr = ended ? 0 : (fv < want && Math.abs(da) < 1.6 ? (far > 620 ? 1.5 : 1) : 0);
    drive(f, thr, turn, !ended && fv > want + 40, dt);
  }

  // The reflected sun rides with the camera, as a reflection does, and sinks across the view.
  const sunAt = d => {
    const k = clamp(d, 0, 1);
    return { x: 340 - k * 300, y: 34 + Math.pow(k, 1.4) * 112, r: k > 0.9 ? 24 * (1 - k) / 0.1 : 8 + 18 * k };
  };

  return {
    enter() {
      const tm = TEAMS[0];
      [objC, o] = canvas(512, 288);
      skiA = skiSprites(tm.c1, tm.c2, PEOPLE.toby.hair, '#ffb020', PEOPLE.toby.skin);
      skiB = skiSprites(tm.c2, tm.c1, PEOPLE.pip.hair, '#e03070', PEOPLE.pip.skin);
      boatC = boatSprites();
      sailC = [bakeSail('#d84a38'), bakeSail('#3a78d8')];
      pines = [bakePine(1), bakePine(2)];
      isSpr = ISLANDS.map(s => bakeIsland(s, pines));
      shal = ISLANDS.map(bakeShallow);
      rampC = bakeRamp(tm);
      jettyC = bakeJetty();
      // pines scattered along every shore, kept clear of the ramp
      trees = [];
      for (let i = 0; i < 700; i++) {
        const u = hash(i * 1.7), v = hash(i * 3.1), side = i % 4, inset = 30 + v * 90;
        let x, y;
        if (side === 0) { x = u * WW; y = shoreS(x) + inset; if (Math.abs(x - RAMP) < 120) continue; }
        else if (side === 1) { x = u * WW; y = shoreN(x) - inset; }
        else if (side === 2) { y = u * WH; x = shoreW(y) - inset; }
        else { y = u * WH; x = shoreE(y) + inset; }
        trees.push({ x, y, s: pines[hash(i * 7.3) > 0.72 ? 1 : 0] });
      }
      buoys = [];
      for (let i = 0; i < 16; i++) buoys.push({ x: 1200 + i * 90 + Math.sin(i) * 50, y: 2320 + Math.cos(i * 1.7) * 60, c: i % 2 ? '#e8342c' : '#f2c218', ph: i });
      for (let i = 0; i < 8; i++) buoys.push({ x: 2600 + Math.sin(i * 2.1) * 170, y: 1100 + i * 70, c: '#ff8a1e', ph: i * 1.3 });
      boats = [{ cx: 1800, cy: 1700, rx: 500, ry: 240, u: 0.7, w: 0.05 }, { cx: 2800, cy: 2200, rx: 240, ry: 180, u: 2.6, w: -0.07 }, { cx: 900, cy: 1300, rx: 220, ry: 280, u: 4.4, w: 0.06 }].map(b => ({ ...b, x: 0, y: 0, a: 0, wake: [], d: 0 }));
      sails = [{ x: 2240, y: 2440, k: 0, ph: 0 }, { x: 1120, y: 2150, k: 1, ph: 2 }, { x: 3120, y: 2060, k: 0, ph: 4 }];
      for (const b of boats) { b.x = b.cx + Math.cos(b.u) * b.rx; b.y = b.cy + Math.sin(b.u) * b.ry; }
      p = newSki(RAMP - 14, S0 - 34, -Math.PI / 2, skiA, 0);
      f = newSki(RAMP + 26, S0 - 52, -Math.PI / 2 + 0.3, skiB, 2);
      cam.x = p.x; cam.y = p.y;
      step = 0; bakeWater(0);
    },
    update(dt, io) {
      t += dt; bumpT -= dt;
      day = Math.min(1, day + dt / DAY);
      const s2 = Math.floor(day * 72);
      if (s2 !== step) { step = s2; bakeWater(day); }
      if (hint > 0) hint -= dt;
      if (day >= 1 && !ended) { ended = true; }
      if (ended && !doneSent) { doneSent = true; ctx.done(); A.sfx('ding'); }
      const thr = !ended && (io.held('KeyW') || io.held('ArrowUp')) ? 1 : 0;
      const brake = io.held('KeyS') || io.held('ArrowDown');
      const turn = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
      drive(p, thr, turn, brake, dt);
      friend(dt);
      hop(p, f); hop(f, p);
      for (const b of boats) {
        b.u += b.w * dt;
        const x = b.cx + Math.cos(b.u) * b.rx, y = b.cy + Math.sin(b.u) * b.ry;
        const dx = x - b.x, dy = y - b.y;
        if (dx || dy) b.a = Math.atan2(dy, dx);
        b.x = x; b.y = y;
        b.d += Math.hypot(dx, dy);
        if (b.d > 12) { b.d = 0; b.wake.push({ x: b.x - Math.cos(b.a) * 24, y: b.y - Math.sin(b.a) * 24, nx: -Math.sin(b.a), ny: Math.cos(b.a), age: 0, sp: 90 }); if (b.wake.length > 120) b.wake.shift(); }
        for (const w of b.wake) w.age += dt;
        while (b.wake.length && b.wake[0].age > 7) b.wake.shift();
      }
      for (const s of spray) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vz -= 300 * dt; }
      spray = spray.filter(s => s.z > 0 && s.t < 1);
      shoutT -= dt;
      if (shout) { shout.t -= dt; if (shout.t <= 0) shout = null; }
      if (shoutT <= 0 && !ended) { shout = { s: rename(SHOUTS[Math.floor(Math.random() * SHOUTS.length)]), t: 4.5 }; shoutT = 22 + Math.random() * 22; }
      const tx = clamp(p.x + p.vx * 0.5, W / 2, WW - W / 2), ty = clamp(p.y + p.vy * 0.5, H / 2, WH - H / 2);
      cam.x += (tx - cam.x) * Math.min(1, dt * 3); cam.y += (ty - cam.y) * Math.min(1, dt * 3);
    },
    draw() {
      const T = t; // our own clock: the host's draw() is called with no time argument
      const L = Math.round(cam.x - W / 2), Tp = Math.round(cam.y - H / 2);
      // water: two scrolling layers of ripples
      tile(waterA, L, Tp);
      tile(waterB, L + Math.round(Math.sin(T * 0.4) * 5 + T * 3), Tp + Math.round(Math.cos(T * 0.3) * 3));
      // shallows ring every island, dimming with the day
      g.globalAlpha = 0.34 * (1 - day * 0.72);
      for (const s of ISLANDS) { const c = shal[s.i], x = s.x - c.cx - L, y = s.y - c.cy - Tp; if (x < W && y < H && x + c.c.width > 0 && y + c.c.height > 0) g.drawImage(c.c, Math.round(x), Math.round(y)); }
      g.globalAlpha = 1;
      // the sun's reflection and its path of glitter
      const q = sunAt(day);
      if (q.r > 0.5) { g.drawImage(glow, Math.round(q.x - 100), Math.round(q.y - 100)); }
      const bright = day > 0.92 ? clamp((1 - day) / 0.08, 0, 1) : 1;
      for (let i = 0; i < 220; i++) {
        const k = Math.pow(hash(i * 7.1), 0.6), side = hash(i * 3.3) - 0.5, x0 = q.x + k * (W * 0.5 - q.x) * 0.15;
        const x = x0 + side * (14 + (58 + day * 150) * k) + Math.sin(T * 0.7 + i) * 2, y = q.y + k * (H + 10 - q.y);
        if (Math.sin(T * (3 + hash(i) * 5) + i * 1.7) < (0.55 - day * 0.5) || hash(i * 2.1) > 0.85 * bright) continue;
        rect(g, x, y, 1 + Math.floor(hash(i * 1.3) * (2 + day * 4)), 1, hash(i * 9) > 0.7 ? '#ffffff' : col.glitter);
      }
      if (q.r > 0.5) { ellipse(g, q.x, q.y, q.r + 2, (q.r + 2) * 0.9, col.crest); ellipse(g, q.x, q.y, q.r, q.r * 0.9, day > 0.8 ? '#ffb050' : '#fff6d0'); }
      // the first stars, reflected
      if (day > 0.93) for (let i = 0; i < 44; i++) { const a = clamp((day - 0.93) / 0.07, 0, 1); if (hash(i * 4.4) < a && Math.sin(T * (1.5 + hash(i) * 2) + i) > -0.3) rect(g, hash(i * 2.7) * W | 0, hash(i * 8.2) * H | 0, 1, 1, '#d8d4f0'); }
      // wakes
      const drawWake = (s, life) => {
        for (const w of s.wake) {
          const v = w.age / life;
          if (v >= 1) continue;
          const spread = 2 + w.age * 8, x = w.x - L, y = w.y - Tp;
          if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
          const c = mix(col.foam, col.water, Math.floor(v * 4) / 4);
          for (const d of [-1, 1]) rect(g, x + w.nx * d * spread, y + w.ny * d * spread, v < 0.5 ? 3 : 2, v < 0.3 ? 2 : 1, c);
          if (w.age < 0.7) { rect(g, x + (hash(w.x) - 0.5) * 5, y + (hash(w.y) - 0.5) * 5, 2, 2, col.foam); rect(g, x, y, 1, 1, col.foam); }
        }
      };
      drawWake(p, 5.5); drawWake(f, 5.5); boats.forEach(b => drawWake(b, 7));
      // Everything solid goes on its own layer so the evening tint can land on it alone.
      o.clearRect(0, 0, W, H);
      const land = (x, y, w, h) => rect(o, x, y, w, h, '#4f9a3a');
      const snap = v => Math.floor(v / 3) * 3;
      for (let sx = -(((L % 3) + 3) % 3); sx < W; sx += 3) {
        const wx = snap(L + sx), n = shoreN(wx) - Tp, s = shoreS(wx) - Tp;
        if (n > 0) { land(sx, 0, 3, n - 12); rect(o, sx, n - 12, 3, 12, '#ecd8a0'); rect(o, sx, n - 2 + Math.sin(T + wx * 0.02) * 1.5, 3, 2, '#f8f4e6'); }
        if (s < H) { rect(o, sx, s, 3, 12, '#ecd8a0'); rect(o, sx, s - 1 + Math.sin(T + wx * 0.02) * 1.5, 3, 2, '#f8f4e6'); land(sx, s + 12, 3, H - s - 12); }
      }
      for (let sy = -(((Tp % 3) + 3) % 3); sy < H; sy += 3) {
        const wy = snap(Tp + sy), l = shoreW(wy) - L, e = shoreE(wy) - L;
        if (l > 0) { land(0, sy, l - 12, 3); rect(o, l - 12, sy, 12, 3, '#ecd8a0'); rect(o, l - 2 + Math.sin(T + wy * 0.02) * 1.5, sy, 2, 3, '#f8f4e6'); }
        if (e < W) { rect(o, e, sy, 12, 3, '#ecd8a0'); rect(o, e - 1 + Math.sin(T + wy * 0.02) * 1.5, sy, 2, 3, '#f8f4e6'); land(e + 12, sy, W - e - 12, 3); }
      }
      for (let wx = Math.floor(L / 18) * 18; wx < L + W; wx += 18) for (let wy = Math.floor(Tp / 18) * 18; wy < Tp + H; wy += 18) {
        if (wy > shoreS(wx) + 14 || wy < shoreN(wx) - 14 || wx < shoreW(wy) - 14 || wx > shoreE(wy) + 14) rect(o, wx - L + (hash(wx) * 10 | 0), wy - Tp + (hash(wy) * 10 | 0), 2, 1, '#5eae48');
      }
      for (const i of ISLANDS) { const c = isSpr[i.i], x = i.x - c.cx - L, y = i.y - c.cy - Tp; if (x < W && y < H && x + c.c.width > 0 && y + c.c.height > 0) o.drawImage(c.c, Math.round(x), Math.round(y)); }
      o.drawImage(rampC, RAMP - 60 - L, S0 - 50 - Tp);
      o.drawImage(jettyC, JETTY.x - 32 - L, Math.round(jettyY() - JETTY.stem[1] - 22 - Tp));
      for (const b of buoys) { const x = b.x - L, y = b.y - Tp; if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; const bob = Math.round(Math.sin(T * 2 + b.ph)); ellipse(o, x + 1, y + 3, 6, 3, 'rgba(0,0,0,0.3)'); ellipse(o, x, y + bob, 5, 6, '#0a0a14'); ellipse(o, x, y + bob, 4, 5, b.c); rect(o, x - 2, y - 3 + bob, 2, 2, '#ffffff'); }
      for (const s of sails) { const x = s.x - L - 26, y = s.y - Tp - 56; if (x < -60 || y < -70 || x > W || y > H) continue; const bob = Math.round(Math.sin(T * 1.2 + s.ph)); ellipse(o, s.x - L, s.y - Tp + 4, 24, 7, 'rgba(0,0,0,0.28)'); o.drawImage(sailC[s.k], x, y + bob); }
      for (const b of boats) { const x = b.x - L, y = b.y - Tp; if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue; ellipse(o, x + 2, y + 4, 26, 11, 'rgba(0,0,0,0.26)'); o.drawImage(boatC[((Math.round(b.a / TAU * DIRS) % DIRS) + DIRS) % DIRS], Math.round(x - 30), Math.round(y - 30)); }
      for (const s of [f, p]) {
        const x = s.x - L, y = s.y - Tp, sp = Math.hypot(s.vx, s.vy);
        const bob = s.z > 0 ? 0 : Math.round(Math.sin(T * 7 + s.ph) * (0.6 + sp / 220));
        ellipse(o, x + 1 + s.z * 0.3, y + 3 + s.z * 0.5, 13 - Math.min(5, s.z * 0.2), 7 - Math.min(3, s.z * 0.1), 'rgba(0,0,0,0.32)');
        const fr = ((Math.round(s.a / TAU * DIRS) % DIRS) + DIRS) % DIRS;
        o.drawImage(s.sprites[fr], Math.round(x - 18), Math.round(y - 18 - s.z + bob));
      }
      for (const s of spray) rect(o, s.x - L, s.y - Tp - s.z, 2, 2, col.foam);
      for (const t2 of trees) { const x = t2.x - L - t2.s.width / 2, y = t2.y - Tp - t2.s.height; if (x < -60 || y < -80 || x > W || y > H) continue; o.drawImage(t2.s, Math.round(x), Math.round(y)); }
      // the day's light lands on the solid layer only
      if (col.strength > 0) { o.globalCompositeOperation = 'source-atop'; o.globalAlpha = col.strength; o.fillStyle = col.tint; o.fillRect(0, 0, W, H); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; }
      g.drawImage(objC, 0, 0);
      // lamps come on as it gets dark
      if (day > 0.74) {
        const flick = (T * 3) % 1 < 0.9 ? '#ffd870' : '#f8b050';
        const c1 = isSpr[1];
        const lamp = (x, y) => { const sx = x - L, sy = y - Tp; if (sx < 0 || sy < 0 || sx > W || sy > H) return; rect(g, sx - 1, sy - 1, 3, 3, '#ffb060'); rect(g, sx, sy, 1, 1, '#fff6c8'); };
        rect(g, ISLANDS[1].x - c1.cx + c1.cx - 20 + 28 - L, ISLANDS[1].y - c1.cy + c1.cy + 10 + 6 - Tp, 8, 7, flick);
        const jy = jettyY() - JETTY.stem[1] - 22;
        for (const [x, y] of [[JETTY.x - 24, jy + 2], [JETTY.x + 24, jy + 2], [JETTY.x - 10, jy + 130], [JETTY.x + 10, jy + 130]]) lamp(x, y);
        for (const b of boats) lamp(b.x, b.y);
        for (const s of sails) lamp(s.x, s.y - 54);
      }
      if (hint > 0) {
        g.globalAlpha = Math.min(1, hint / 2);
        text(g, 'W THROTTLE   A/D STEER   S SLOW OR REVERSE', 10, 8, '#ffffff', { outline: '#0a1a2a' });
        g.globalAlpha = 1;
      }
      if (shout && !ended) { g.globalAlpha = Math.min(1, shout.t); text(g, shout.s, W / 2, H - 14, '#fff4c0', { align: 'center', outline: '#0a1a2a' }); g.globalAlpha = 1; }
      if (ended) {
        const msg = "The sun's gone. Time to pull the skis out.";
        panel(g, 124, 206, 264, 26, { fill: '#141430', edge: '#7a6a9a', hi: '#c8b8d8', lo: '#28244a' });
        text(g, msg, W / 2, 215, '#ffe8b0', { align: 'center' });
      }
    },
    get day() { return day; }, set day(v) { day = clamp(v, 0, 1); },
  };
}
