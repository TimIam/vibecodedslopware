// Pixel art made in code: sprites are rasterised once into small canvases with hard edges.
import { COMPOUNDS, TEAMS } from './data.js';

export const W = 512, H = 288;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
export function rgb(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function shade(c, k) { const [r, g, b] = hex(c); return k >= 0 ? rgb(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : rgb(r * (1 + k), g * (1 + k), b * (1 + k)); }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }

// Scanline polygon fill on pixel centres: crisp, no anti-aliasing.
export function poly(g, pts, color) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  g.fillStyle = color;
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

export function ellipse(g, cx, cy, rx, ry, color) {
  g.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    if (b > a) g.fillRect(a, y, b - a, 1);
  }
}

export function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

// 1px dark outline around every opaque region.
export function outline(c, color = '#0a0a10') {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h);
  const a = d.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  const mark = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) mark.push(x, y);
  }
  g.fillStyle = color;
  for (let i = 0; i < mark.length; i += 2) g.fillRect(mark[i], mark[i + 1], 1, 1);
  return c;
}

// Ordered dither helper: true on a 2x2 checker scaled by density.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function dith(x, y, t) { return BAYER[(y & 3) * 4 + (x & 3)] < t * 16; }

export function ditherRect(g, x, y, w, h, color, t) {
  g.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (dith(x + i, y + j, t)) g.fillRect(x + i, y + j, 1, 1);
}

// ---------------------------------------------------------------- cars
// Top-down open-wheeler facing right, 76x30, without wheels (wheels are separate so they can come off).
export const CAR_W = 76, CAR_H = 30;
export const WHEELS = [ // corner, x, y (top-left of a 14x7 tyre in car space), key
  { id: 'RL', x: 7, y: 0, key: 'q' },
  { id: 'FL', x: 51, y: 1, key: 'e' },
  { id: 'RR', x: 7, y: 23, key: 'z' },
  { id: 'FR', x: 51, y: 22, key: 'c' },
];

const carCache = new Map();
export function carSprite(team, opts = {}) {
  const key = team.id + (opts.noNose ? 'n' : '') + (opts.damaged ? 'd' : '');
  if (carCache.has(key)) return carCache.get(key);
  const [c, g] = canvas(CAR_W + 2, CAR_H + 2);
  g.translate(1, 1);
  const c1 = team.c1, c2 = team.c2, c3 = team.c3, lit = shade(c1, 0.3), dark = shade(c1, -0.3);
  // floor (dark, wider than body)
  poly(g, [[9, 7], [48, 7], [52, 11], [52, 18], [48, 22], [9, 22]], '#1c1d22');
  // rear wing
  rect(g, 0, 4, 6, 22, c3); rect(g, 1, 5, 4, 20, c1); rect(g, 1, 6, 4, 2, lit); rect(g, 0, 4, 6, 1, c2); rect(g, 0, 25, 6, 1, c2);
  rect(g, 5, 12, 5, 6, '#2a2b30');
  // engine cover and sidepods
  poly(g, [[8, 10], [22, 9], [26, 6], [44, 7], [48, 10], [48, 19], [44, 22], [26, 23], [22, 20], [8, 19]], c1);
  poly(g, [[8, 10], [22, 9], [26, 6], [44, 7], [48, 10], [48, 13], [8, 13]], lit);
  poly(g, [[8, 17], [48, 17], [48, 19], [44, 22], [26, 23], [22, 20], [8, 19]], dark);
  // sidepod inlets
  rect(g, 41, 7, 3, 3, '#101014'); rect(g, 41, 20, 3, 3, '#101014');
  // livery stripe
  rect(g, 8, 14, 60, 2, c2);
  // nose
  if (!opts.noNose) {
    poly(g, [[47, 10], [68, 12], [70, 14], [70, 16], [68, 18], [47, 20]], c1);
    poly(g, [[47, 10], [68, 12], [70, 14], [47, 14]], lit);
    rect(g, 48, 14, 21, 2, c2);
    // front wing
    if (!opts.damaged) {
      rect(g, 66, 2, 6, 26, c3); rect(g, 67, 3, 4, 24, c2); rect(g, 70, 3, 2, 24, shade(c2, -0.25));
      rect(g, 65, 2, 8, 1, c1); rect(g, 65, 27, 8, 1, c1);
    } else {
      rect(g, 66, 9, 6, 13, c3); rect(g, 67, 10, 4, 6, c2); rect(g, 68, 17, 3, 4, shade(c2, -0.3));
      rect(g, 70, 5, 2, 3, c2); rect(g, 64, 24, 3, 2, c3);
    }
  }
  // cockpit, helmet and halo
  rect(g, 34, 11, 11, 8, '#0c0c10');
  ellipse(g, 39.5, 15, 3.4, 3.4, team.helmet);
  rect(g, 41, 13, 2, 4, '#1b2633');
  rect(g, 33, 10, 1, 10, '#6c7078'); rect(g, 33, 10, 12, 1, '#6c7078'); rect(g, 33, 19, 12, 1, '#6c7078');
  rect(g, 44, 14, 3, 2, '#6c7078');
  // mirrors
  rect(g, 44, 8, 2, 1, '#2a2b30'); rect(g, 44, 21, 2, 1, '#2a2b30');
  // airbox
  rect(g, 30, 13, 3, 4, '#0c0c10');
  outline(c);
  carCache.set(key, c);
  return c;
}

// Detached nose cone (for the wing change), 26x28.
const noseCache = new Map();
export function noseSprite(team, damaged) {
  const key = team.id + (damaged ? 'd' : '');
  if (noseCache.has(key)) return noseCache.get(key);
  const [c, g] = canvas(30, 30);
  g.translate(1, 1);
  const c1 = team.c1, c2 = team.c2, c3 = team.c3;
  poly(g, [[0, 9], [21, 11], [23, 13], [23, 15], [21, 17], [0, 19]], c1);
  rect(g, 1, 13, 21, 2, c2);
  if (damaged) { rect(g, 19, 8, 6, 13, c3); rect(g, 20, 9, 4, 6, c2); rect(g, 23, 4, 2, 3, c2); }
  else { rect(g, 19, 1, 6, 26, c3); rect(g, 20, 2, 4, 24, c2); rect(g, 18, 1, 8, 1, c1); rect(g, 18, 26, 8, 1, c1); }
  outline(c);
  noseCache.set(key, c);
  return c;
}

const wheelCache = new Map();
export function wheelSprite(compound, frame = 0, worn = false) {
  const key = compound + frame + (worn ? 'w' : '');
  if (wheelCache.has(key)) return wheelCache.get(key);
  const [c, g] = canvas(16, 9);
  g.translate(1, 1);
  const col = COMPOUNDS[compound].color;
  rect(g, 0, 0, 14, 7, worn ? '#26262a' : '#1a1a1f');
  rect(g, 1, 0, 12, 1, '#34343c');
  for (let x = (frame % 3); x < 14; x += 3) rect(g, x, 1, 1, 5, worn ? '#303036' : '#0e0e12');
  rect(g, 2, 0, 10, 1, col); rect(g, 2, 6, 10, 1, shade(col, -0.35));
  if (worn) { rect(g, 4, 2, 2, 2, '#4a4a52'); rect(g, 9, 3, 2, 2, '#4a4a52'); }
  outline(c);
  wheelCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- crew (drawn live)
// A person seen from above: shoulders, two arms, helmet with visor on the facing side.
// dir: 0 up, 1 right, 2 down, 3 left. reach: 0..1 how far arms go out. tool: 'gun'|'tyre'|'jack'|'lolly'|'hose'|'ext'|'blower'|null
export function crew(g, x, y, dir, team, { reach = 0.4, tool = null, bob = 0, lolly = 'red', crouch = false, toolColor } = {}) {
  x = Math.round(x); y = Math.round(y + bob);
  const R = (lx, ly, w, h, color) => {
    // rotate the rect (local, facing up) into screen space
    let rx, ry, rw, rh;
    if (dir === 0) { rx = lx; ry = ly; rw = w; rh = h; }
    else if (dir === 2) { rx = -lx - w; ry = -ly - h; rw = w; rh = h; }
    else if (dir === 1) { rx = -ly - h; ry = lx; rw = h; rh = w; }
    else { rx = ly; ry = -lx - w; rw = h; rh = w; }
    g.fillStyle = color; g.fillRect(x + rx, y + ry, rw, rh);
  };
  const suit = team.c1, sd = shade(team.c1, -0.35), arm = Math.round(2 + reach * 5);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(x - 5, y - 3, 11, 8);
  // outline then body
  R(-6, -2, 12, 6, '#0a0a10');
  R(-5, -3, 10, 8, '#0a0a10');
  R(-5, -2, 10, 6, suit);
  R(-4, 2, 8, 2, sd);
  // arms
  R(-6, -1 - arm, 3, arm + 1, '#0a0a10'); R(3, -1 - arm, 3, arm + 1, '#0a0a10');
  R(-5, -arm, 1, arm, suit); R(4, -arm, 1, arm, suit);
  R(-5, -arm - 1, 2, 2, '#16161a'); R(3, -arm - 1, 2, 2, '#16161a');
  // tools held in front
  if (tool === 'gun') { R(-2, -arm - 4, 4, 4, '#0a0a10'); R(-1, -arm - 3, 2, 3, toolColor || '#c8c8cc'); }
  if (tool === 'tyre') { R(-6, -arm - 7, 12, 7, '#0a0a10'); R(-5, -arm - 6, 10, 5, '#1a1a1f'); R(-4, -arm - 6, 8, 1, toolColor || '#f2c218'); }
  if (tool === 'jack') { R(-1, -arm - 10, 3, 11, '#0a0a10'); R(0, -arm - 9, 1, 9, '#d0d4da'); }
  if (tool === 'lolly') { R(0, -arm - 6, 1, 6, '#888'); R(-3, -arm - 12, 7, 7, '#0a0a10'); R(-2, -arm - 11, 5, 5, lolly === 'green' ? '#38d860' : lolly === 'amber' ? '#ffb000' : '#e8342c'); }
  if (tool === 'hose') { R(-2, -arm - 5, 4, 5, '#0a0a10'); R(-1, -arm - 4, 2, 4, '#8a8a92'); }
  if (tool === 'ext') { R(-2, -arm - 5, 4, 6, '#0a0a10'); R(-1, -arm - 4, 2, 5, '#e8342c'); }
  if (tool === 'blower') { R(-2, -arm - 6, 4, 6, '#0a0a10'); R(-1, -arm - 5, 2, 5, '#f0c020'); }
  // helmet
  const hc = team.helmetCrew || '#f2f2f2';
  R(-3, -3, 6, 6, '#0a0a10');
  R(-2, -4, 4, 8, '#0a0a10');
  R(-2, -2, 4, 4, hc);
  R(-3, -1, 6, 2, hc);
  R(-2, -3, 4, 1, '#1b2633');
  R(-1, 1, 2, 1, shade(hc, -0.25));
}

// ---------------------------------------------------------------- portraits 32x32
const portCache = new Map();
// Cached sprites bake in team colours, so a livery change starts them over.
export function clearCaches() { carCache.clear(); noseCache.clear(); portCache.clear(); }

export function portrait(p, mouth = 0, blink = false) {
  const key = p.name + p.bg + mouth + (blink ? 'b' : '');
  const tm = TEAMS[0];
  if (portCache.has(key)) return portCache.get(key);
  const [c, g] = canvas(32, 32);
  // panel
  rect(g, 0, 0, 32, 32, p.bg);
  for (let y = 0; y < 32; y += 2) ditherRect(g, 0, y, 32, 1, shade(p.bg, 0.12), 0.25);
  const skin = p.skin, sd = shade(skin, -0.22), sl = shade(skin, 0.15);
  if (p.helmet) {
    const tc = tm.c1, t2 = tm.c2, hl = tm.helmet;
    // shoulders / suit
    rect(g, 4, 26, 24, 6, tc); rect(g, 4, 26, 24, 1, shade(tc, 0.3)); rect(g, 14, 26, 4, 6, t2);
    // helmet shell
    ellipse(g, 16, 15, 12, 12.5, hl);
    ellipse(g, 16, 13, 10, 9, shade(hl, 0.25));
    rect(g, 4, 18, 24, 3, t2);
    rect(g, 5, 21, 22, 4, hl);
    // open visor shows eyes and skin
    rect(g, 7, 11, 18, 8, '#0b0b10');
    rect(g, 8, 12, 16, 6, skin);
    rect(g, 8, 12, 16, 1, sd);
    const ey = 14;
    if (blink) { rect(g, 10, ey + 1, 4, 1, '#1a1010'); rect(g, 18, ey + 1, 4, 1, '#1a1010'); }
    else { rect(g, 10, ey, 4, 2, '#f8f8f8'); rect(g, 18, ey, 4, 2, '#f8f8f8'); rect(g, 11, ey, 2, 2, p.eyes); rect(g, 19, ey, 2, 2, p.eyes); }
    rect(g, 9, 13, 5, 1, shade(skin, -0.45)); rect(g, 18, 13, 5, 1, shade(skin, -0.45));
    rect(g, 6, 9, 20, 2, '#2a3440'); // visor edge raised
    rect(g, 7, 8, 18, 1, '#5a6a7a');
    // chin bar with mouth vent
    rect(g, 12, 21, 8, 2, '#0b0b10');
    if (mouth) rect(g, 13, 21, 6, 2, '#7a2020');
    // number
    rect(g, 22, 3, 7, 6, '#0b0b10');
    rect(g, 23, 4, 5, 4, '#fff');
    if (p.num === 7) { rect(g, 23, 4, 5, 1, '#111'); rect(g, 26, 5, 1, 1, '#111'); rect(g, 25, 6, 1, 2, '#111'); }
    else { rect(g, 24, 4, 1, 4, '#111'); rect(g, 26, 4, 1, 4, '#111'); }
    outlineInner(c);
    portCache.set(key, c);
    return c;
  }
  // body
  const shirt = p.suit ? '#24242c' : p.fireproof ? '#d8d8d8' : tm.c1;
  rect(g, 3, 25, 26, 7, shirt);
  rect(g, 3, 25, 26, 1, shade(shirt, 0.25));
  if (p.suit) { rect(g, 13, 25, 6, 7, '#e8e8e8'); rect(g, 15, 26, 2, 6, '#b02020'); }
  else if (p.fireproof) { rect(g, 3, 28, 26, 2, tm.c2); }
  else { rect(g, 3, 28, 26, 1, tm.c2); rect(g, 14, 25, 4, 3, sd); }
  // neck
  rect(g, 13, 21, 6, 5, sd);
  // head
  ellipse(g, 16, 14, 8, 9.5, skin);
  ellipse(g, 14, 12, 5, 6, sl);
  rect(g, 8, 13, 1, 4, sd); rect(g, 23, 13, 1, 4, sd);
  // ears
  rect(g, 7, 13, 2, 4, sd); rect(g, 23, 13, 2, 4, sd);
  // hair
  const hc = p.hair, hd = shade(hc, -0.3);
  if (p.hairStyle === 'crop') { ellipse(g, 16, 7, 8, 4, hc); rect(g, 8, 6, 16, 3, hc); rect(g, 9, 9, 2, 3, hc); rect(g, 21, 9, 2, 3, hc); }
  if (p.hairStyle === 'mop') { ellipse(g, 16, 6, 10, 5.5, hc); rect(g, 7, 6, 4, 7, hc); rect(g, 21, 6, 4, 7, hc); rect(g, 10, 8, 12, 2, hc); rect(g, 12, 10, 3, 1, hc); rect(g, 17, 10, 4, 1, hd); }
  if (p.hairStyle === 'bald') { rect(g, 12, 5, 8, 1, sl); rect(g, 7, 10, 2, 4, hc); rect(g, 23, 10, 2, 4, hc); }
  if (p.hairStyle === 'neat') { ellipse(g, 16, 6.5, 8.5, 4.5, hc); rect(g, 8, 6, 3, 6, hc); rect(g, 21, 6, 3, 5, hc); rect(g, 11, 8, 8, 1, hd); }
  if (p.hairStyle === 'bob') { ellipse(g, 16, 7, 9.5, 5.5, hc); rect(g, 6, 7, 4, 12, hc); rect(g, 22, 7, 4, 12, hc); rect(g, 10, 9, 13, 2, hc); }
  if (p.hairStyle === 'slick') { ellipse(g, 16, 6.5, 8.5, 4, hc); rect(g, 8, 6, 2, 6, hc); rect(g, 22, 6, 2, 6, hc); rect(g, 10, 6, 12, 1, shade(hc, 0.3)); }
  // eyes
  const ey = 14;
  if (p.shades) { rect(g, 9, ey - 1, 14, 4, '#0b0b10'); rect(g, 10, ey - 1, 4, 1, '#4a5a7a'); rect(g, 18, ey - 1, 4, 1, '#4a5a7a'); }
  else {
    if (blink) { rect(g, 10, ey + 1, 4, 1, '#2a1a10'); rect(g, 18, ey + 1, 4, 1, '#2a1a10'); }
    else { rect(g, 10, ey, 4, 2, '#f4f4f4'); rect(g, 18, ey, 4, 2, '#f4f4f4'); rect(g, 11, ey, 2, 2, '#22160e'); rect(g, 19, ey, 2, 2, '#22160e'); }
    rect(g, 10, ey - 2, 4, 1, shade(hc || '#333', -0.2)); rect(g, 18, ey - 2, 4, 1, shade(hc || '#333', -0.2));
    if (p.glasses === 'round') { g.fillStyle = '#1a1a1a'; for (const ox of [9, 17]) { g.fillRect(ox, ey - 1, 6, 1); g.fillRect(ox, ey + 2, 6, 1); g.fillRect(ox, ey - 1, 1, 4); g.fillRect(ox + 5, ey - 1, 1, 4); } g.fillRect(15, ey, 2, 1); }
    if (p.glasses === 'safety') { rect(g, 9, ey - 1, 14, 4, 'rgba(160,220,255,0.45)'); rect(g, 9, ey - 1, 14, 1, '#7ab0d0'); }
  }
  // nose
  rect(g, 15, 16, 2, 2, sd);
  if (p.freckles) for (const [fx, fy] of [[11, 17], [13, 18], [19, 18], [21, 17], [12, 19], [20, 19]]) rect(g, fx, fy, 1, 1, '#c07a50');
  // mouth / moustache
  if (p.moustache) { rect(g, 11, 18, 10, 2, hc); rect(g, 10, 19, 2, 2, hc); rect(g, 20, 19, 2, 2, hc); }
  if (mouth) { rect(g, 13, 20, 6, 2, '#5a1a1a'); rect(g, 14, 20, 4, 1, '#f0f0f0'); }
  else rect(g, 13, 20, 6, 1, shade(skin, -0.45));
  // headset
  if (p.headset) {
    rect(g, 7, 4, 18, 1, '#222'); rect(g, 6, 5, 1, 7, '#222'); rect(g, 25, 5, 1, 7, '#222');
    rect(g, 5, 11, 4, 6, tm.c1); rect(g, 23, 11, 4, 6, tm.c1); rect(g, 5, 11, 4, 1, shade(tm.c1, 0.45)); rect(g, 23, 11, 4, 1, shade(tm.c1, 0.45));
    if (p.mic) { rect(g, 8, 17, 1, 3, '#222'); rect(g, 9, 20, 4, 1, '#222'); rect(g, 12, 19, 2, 2, '#444'); }
  }
  outlineInner(c);
  portCache.set(key, c);
  return c;
}
function outlineInner(c) {
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10';
  g.fillRect(0, 0, 32, 1); g.fillRect(0, 31, 32, 1); g.fillRect(0, 0, 1, 32); g.fillRect(31, 0, 1, 32);
}

// ---------------------------------------------------------------- icons
export function tyreIcon(g, x, y, compound, r = 4) {
  const col = COMPOUNDS[compound].color;
  ellipse(g, x, y, r + 1, r + 1, '#0a0a10');
  ellipse(g, x, y, r, r, col);
  ellipse(g, x, y, r - 1.5, r - 1.5, '#1a1a1f');
  rect(g, x - 1, y - 1, 2, 2, '#888');
}

// Nine-slice-ish 16-bit window frame.
export function panel(g, x, y, w, h, { fill = '#141826', edge = '#5c6a8a', hi = '#9aa8c8', lo = '#22283a' } = {}) {
  rect(g, x, y, w, h, '#05060a');
  rect(g, x + 1, y + 1, w - 2, h - 2, edge);
  rect(g, x + 2, y + 2, w - 4, h - 4, lo);
  rect(g, x + 2, y + 2, w - 4, 1, hi);
  rect(g, x + 2, y + 2, 1, h - 4, hi);
  rect(g, x + 3, y + 3, w - 6, h - 6, fill);
}

export function bar(g, x, y, w, h, t, color, back = '#0a0a10') {
  rect(g, x, y, w, h, back);
  rect(g, x + 1, y + 1, Math.max(0, Math.round((w - 2) * Math.max(0, Math.min(1, t)))), h - 2, color);
}
