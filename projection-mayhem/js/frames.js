// Projection Mayhem: all the 2D art. Film stills, leaders, cue marks, mischief frames, posters.
//
// Every still is hand-composed from a small procedural vocabulary (skies, seas, skylines, rooms,
// people, animals, vehicles, props) in a virtual 400x290 canvas, then run through a per-film colour
// grade (b&w, silent sepia, Technicolor, teal-orange, ...) with seeded grain and a vignette.
// Deterministic: the only noise is a hash of (film, shot, t). `t` in [0,1) nudges the subject a
// couple of pixels and changes the grain, so neighbouring frames on a strip look nearly identical.
//
//   paintShot(ctx, filmId, shot, w, h, t = 0)
//   paintLeader(ctx, kind, n, w, h)        kind: 'countdown' | 'black' | 'head' | 'tail' | 'start'
//   paintCue(ctx, w, h)
//   paintMischief(ctx, id, w, h)
//   paintPoster(ctx, film, w, h)

import { FILMS, FILM_BY_ID } from './films.js';

const VW = 400, VH = 290, TAU = Math.PI * 2;

// ---------------------------------------------------------------- core / rng
let c = null;          // current 2D context (virtual 400x290 coordinates)
let M = 0;             // current motion parameter t
let rng = Math.random; // replaced per paint with a seeded generator

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seeded(seed) { return mulberry(typeof seed === 'string' ? hashStr(seed) : seed >>> 0); }
function h2(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const R = (a = 1, b) => b === undefined ? rng() * a : a + rng() * (b - a);
const wob = (k = 1, f = 1, ph = 0) => Math.sin((M * f + ph) * TAU) * k; // tiny periodic motion

const scratchPool = new Map();
function scratch(w, h, key = 'a') {
  let cv = scratchPool.get(key);
  if (!cv) {
    cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratchPool.set(key, cv);
  }
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  return cv;
}

// ---------------------------------------------------------------- drawing primitives
function rect(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function circ(x, y, r, col) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fillStyle = col; c.fill(); }
function ring(x, y, r, col, lw = 2) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
function ell(x, y, rx, ry, col, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); c.fillStyle = col; c.fill(); }
function poly(pts, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); }
function line(x1, y1, x2, y2, col, lw = 2, cap = 'round') { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = cap; c.stroke(); }
function pline(pts, col, lw = 2) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
function rr(x, y, w, h, r, col) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fillStyle = col; c.fill(); }
function svg(d, col, x = 0, y = 0, s = 1, flip = 1, stroke) {
  c.save(); c.translate(x, y); c.scale(s * flip, s);
  const p = new Path2D(d);
  if (col) { c.fillStyle = col; c.fill(p); }
  if (stroke) { c.strokeStyle = stroke[0]; c.lineWidth = stroke[1] / s; c.stroke(p); }
  c.restore();
}
function lg(x1, y1, x2, y2, stops) { const g = c.createLinearGradient(x1, y1, x2, y2); stops.forEach((s, i) => Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(i / Math.max(1, stops.length - 1), s)); return g; }
function rg(x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach((s, i) => Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(i / Math.max(1, stops.length - 1), s)); return g; }
function txt(s, x, y, size, col, o = {}) {
  c.save();
  c.font = `${o.style || ''} ${o.weight || ''} ${size}px ${o.font || 'Georgia, "Times New Roman", serif'}`;
  c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
  if (o.spacing && 'letterSpacing' in c) c.letterSpacing = o.spacing + 'px';
  if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.blur ?? 6; c.shadowOffsetX = o.sx ?? 0; c.shadowOffsetY = o.sy ?? 0; }
  if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw || 3; c.lineJoin = 'round'; c.strokeText(s, x, y, o.max); }
  if (col) { c.fillStyle = col; c.fillText(s, x, y, o.max); }
  c.restore();
}
function at(x, y, s, flip, fn) { c.save(); c.translate(x, y); c.scale(s * (flip || 1), s); fn(); c.restore(); }
function alpha(a, fn) { const p = c.globalAlpha; c.globalAlpha = p * a; fn(); c.globalAlpha = p; }
function blend(mode, fn) { const p = c.globalCompositeOperation; c.globalCompositeOperation = mode; fn(); c.globalCompositeOperation = p; }
function clip(x, y, w, h, fn) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); fn(); c.restore(); }
function clipCirc(x, y, r, fn) { c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); fn(); c.restore(); }
function glow(x, y, r, col) { c.fillStyle = rg(x, y, 0, r, [col, 'rgba(0,0,0,0)']); c.fillRect(x - r, y - r, r * 2, r * 2); }
function shade(x, y, rx, ry = rx * 0.25, a = 0.35) { ell(x, y, rx, ry, `rgba(0,0,0,${a})`); }

// ---------------------------------------------------------------- scenery
function sky(top, bot, y1 = VH, y0 = 0) { c.fillStyle = lg(0, y0, 0, y1, [top, bot]); c.fillRect(0, y0, VW, y1 - y0); }
function sky3(a, b, d, y1 = VH) { c.fillStyle = lg(0, 0, 0, y1, [a, b, d]); c.fillRect(0, 0, VW, y1); }
function ground(y, top, bot = top) { c.fillStyle = lg(0, y, 0, VH, [top, bot]); c.fillRect(0, y, VW, VH - y); }
function sun(x, y, r, col = '#ffe9a0', halo = 'rgba(255,220,140,0.45)') { glow(x, y, r * 3.2, halo); circ(x, y, r, col); }
function moon(x, y, r, col = '#f4f0d8') { glow(x, y, r * 3, 'rgba(230,230,200,0.25)'); circ(x, y, r, col); circ(x + r * 0.3, y - r * 0.2, r * 0.18, 'rgba(0,0,0,0.07)'); circ(x - r * 0.35, y + r * 0.3, r * 0.12, 'rgba(0,0,0,0.07)'); }
function stars(n, seed, ymax = VH, col = '#fff') { const r = seeded(seed); for (let i = 0; i < n; i++) { const x = r() * VW, y = r() * ymax, s = r() * 1.3 + 0.3; alpha(0.4 + r() * 0.6, () => rect(x, y, s, s, col)); } }
function clouds(seed, n, y0, y1, col = 'rgba(255,255,255,0.8)', sc = 1) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * (VW + 80) - 40 + M * 3, y = y0 + r() * (y1 - y0), w = (30 + r() * 50) * sc;
    for (let k = 0; k < 5; k++) ell(x + (k - 2) * w * 0.28, y - Math.sin(k / 4 * Math.PI) * w * 0.18, w * 0.3, w * 0.2, col);
  }
}
function sea(y, top, bot, wave = 'rgba(255,255,255,0.25)', seed = 3) {
  c.fillStyle = lg(0, y, 0, VH, [top, bot]); c.fillRect(0, y, VW, VH - y);
  const r = seeded(seed);
  for (let i = 0; i < 40; i++) { const yy = y + 2 + Math.pow(r(), 1.6) * (VH - y), ww = 4 + (yy - y) * 0.25 * r(); const xx = r() * VW + wob(1.5, 1, r()); line(xx, yy, xx + ww, yy, wave, 1 + (yy - y) / 80); }
}
function hills(y, amp, col, seed = 1, freq = 2) {
  const r = seeded(seed); const p1 = r() * 6, p2 = r() * 6;
  c.beginPath(); c.moveTo(0, VH);
  for (let x = 0; x <= VW; x += 8) c.lineTo(x, y - amp * (0.6 * Math.sin(x / VW * freq * Math.PI + p1) + 0.4 * Math.sin(x / VW * freq * 2.7 * Math.PI + p2)));
  c.lineTo(VW, VH); c.closePath(); c.fillStyle = col; c.fill();
}
function mountains(y, amp, col, seed = 2, n = 7, snow) {
  const r = seeded(seed); const pts = [0, VH, 0, y]; let x = 0;
  const peaks = [];
  while (x < VW) { const w = VW / n * (0.6 + r() * 0.8); const px = x + w / 2, py = y - amp * (0.4 + r() * 0.6); pts.push(px, py, x + w, y - amp * r() * 0.25); peaks.push([px, py, w]); x += w; }
  pts.push(VW, VH); poly(pts, col);
  if (snow) peaks.forEach(([px, py, w]) => poly([px, py, px - w * 0.14, py + amp * 0.22, px - w * 0.04, py + amp * 0.17, px + w * 0.05, py + amp * 0.24, px + w * 0.15, py + amp * 0.2], snow));
}
function skyline(y, col, seed = 5, o = {}) {
  const r = seeded(seed); let x = -5;
  const minH = o.minH ?? 30, maxH = o.maxH ?? 110;
  while (x < VW) {
    const w = (o.minW ?? 14) + r() * (o.varW ?? 26), hh = minH + Math.pow(r(), o.pow ?? 1.4) * (maxH - minH);
    rect(x, y - hh, w, hh + 1, col);
    if (r() < (o.spire ?? 0.15)) { poly([x + w / 2 - 2, y - hh, x + w / 2 + 2, y - hh, x + w / 2, y - hh - 18 - r() * 20], col); }
    if (r() < (o.stepped ?? 0.2)) rect(x + w * 0.2, y - hh - 10, w * 0.6, 11, col);
    if (o.win) { for (let wy = y - hh + 5; wy < y - 6; wy += 7) for (let wx = x + 3; wx < x + w - 4; wx += 5) if (r() < (o.lit ?? 0.35)) rect(wx, wy, 2.2, 3, o.win); }
    x += w + (o.gap ?? 0) * r();
  }
}
function rain(seed, n, col = 'rgba(220,230,255,0.45)', ang = 0.15, len = 14) { const r = seeded(seed + Math.floor(M * 7)); for (let i = 0; i < n; i++) { const x = r() * (VW + 60) - 30, y = r() * VH; line(x, y, x + ang * len, y + len, col, 1); } }
function snow(seed, n, col = 'rgba(255,255,255,0.85)') { const r = seeded(seed); for (let i = 0; i < n; i++) { const x = r() * VW + wob(2, 1, r()), y = (r() * VH + M * 6) % VH; circ(x, y, 0.6 + r() * 1.4, col); } }
function fog(y0, y1, col = 'rgba(255,255,255,0.35)') { c.fillStyle = lg(0, y0, 0, y1, ['rgba(0,0,0,0)', col, 'rgba(0,0,0,0)']); c.fillRect(0, y0, VW, y1 - y0); }
function haze(col, a = 0.3) { alpha(a, () => rect(0, 0, VW, VH, col)); }
function cone(x, y, ang, spread, len, col = 'rgba(255,250,220,0.35)') {
  const a1 = ang - spread, a2 = ang + spread;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a1) * len, y + Math.sin(a1) * len); c.lineTo(x + Math.cos(a2) * len, y + Math.sin(a2) * len); c.closePath();
  c.fillStyle = rg(x, y, 0, len, [col, 'rgba(0,0,0,0)']); c.fill();
}
function rays(x, y, n, col, len = 400, w = 0.06, ph = 0) { for (let i = 0; i < n; i++) cone(x, y, ph + i / n * TAU, w, len, col); }
function room(wall, floor, hy = 190, o = {}) {
  rect(0, 0, VW, hy, wall);
  c.fillStyle = lg(0, hy, 0, VH, [floor, o.floor2 || floor]); c.fillRect(0, hy, VW, VH - hy);
  if (o.tiles) { for (let i = -10; i <= 10; i++) line(200 + i * 18, hy, 200 + i * 60, VH, o.tiles, 1); for (let k = 0; k < 6; k++) { const yy = hy + Math.pow(k / 6, 1.7) * (VH - hy); line(0, yy, VW, yy, o.tiles, 1); } }
  if (o.skirting) rect(0, hy - 6, VW, 6, o.skirting);
  if (o.stripes) for (let x = 0; x < VW; x += o.stripes[1]) rect(x, 0, o.stripes[1] / 2, hy - 6, o.stripes[0]);
}
function windowBox(x, y, w, h, frame, inside) {
  clip(x, y, w, h, inside);
  c.strokeStyle = frame; c.lineWidth = 4; c.strokeRect(x, y, w, h);
  line(x + w / 2, y, x + w / 2, y + h, frame, 3); line(x, y + h / 2, x + w, y + h / 2, frame, 3);
}
function blinds(x, y, w, h, col = 'rgba(0,0,0,0.55)', n = 10) { for (let i = 0; i < n; i++) rect(x, y + i * h / n, w, h / n * 0.45, col); }
function lightShafts(x, y, w, h, n, col, ang = 0.5) { for (let i = 0; i < n; i++) { const yy = y + i * h / n; poly([x, yy, x, yy + h / n * 0.5, x + 300, yy + h / n * 0.5 + 300 * ang, x + 300, yy + 300 * ang], col); } }
function frameCard(lines, o = {}) {
  rect(0, 0, VW, VH, o.bg || '#0b0b0b');
  const fg = o.fg || '#efe8d6';
  c.strokeStyle = fg; c.lineWidth = 2; c.strokeRect(22, 20, VW - 44, VH - 40); c.lineWidth = 1; c.strokeRect(28, 26, VW - 56, VH - 52);
  [[30, 28], [VW - 30, 28], [30, VH - 28], [VW - 30, VH - 28]].forEach(([x, y]) => { circ(x, y, 5, fg); ring(x, y, 9, fg, 1); });
  for (let x = 60; x < VW - 60; x += 12) circ(x, 26, 1.2, fg), circ(x, VH - 26, 1.2, fg);
  const sz = o.size || 26, lh = sz * 1.3, y0 = VH / 2 - (lines.length - 1) * lh / 2 + (o.dy || 0);
  lines.forEach((l, i) => txt(l, VW / 2, y0 + i * lh, sz, fg, { font: o.font || '"Palatino Linotype", Palatino, Georgia, serif', style: o.italic ? 'italic' : '', max: VW - 80 }));
  if (o.logo) txt(o.logo, VW - 50, VH - 42, 10, fg, { font: 'Georgia, serif' });
}

// ---------------------------------------------------------------- people
// person(x, feetY, height, opts). Designed at 100 units tall, origin at the feet.
// opts: skin top bottom hair hairStyle hat dress coat pose facing sil eyes glasses tie cape wings scarf shoes
const POSES = {
  stand: [0.12, -0.12, 0.06, -0.06], walk: [0.5, -0.45, 0.32, -0.3], run: [1.15, -1.0, 0.75, -0.6],
  armsUp: [2.7, -2.7, 0.05, -0.05], out: [1.55, -1.55, 0.1, -0.1], point: [1.5, -0.2, 0.06, -0.06], wave: [2.5, -0.2, 0.06, -0.06],
  sit: [0.7, 0.5, 1.5, 1.4], hold: [0.9, 0.7, 0.06, -0.06], fight: [1.9, 1.2, 0.35, -0.3], lean: [0.4, -0.6, 0.15, -0.35], dance: [2.4, -1.0, 0.45, -0.15],
};
function limb(x, y, ang, len, wid, col, end, endR) {
  const ex = x + Math.sin(ang) * len, ey = y + Math.cos(ang) * len;
  line(x, y, ex, ey, col, wid, 'round'); if (end) circ(ex, ey, endR || wid * 0.55, end);
  return [ex, ey];
}
function person(x, y, h, o = {}) {
  const s = h / 100, f = o.facing || 1;
  c.save(); c.translate(x, y); c.scale(s * f, s);
  if (o.rot) c.rotate(o.rot);
  const S = o.sil;
  const skin = S || o.skin || '#e2b48e', top = S || o.top || '#5a5a64', bot = S || o.bottom || '#2c2c34', hair = S || o.hair || '#3b2a1c';
  const shoes = S || o.shoes || '#1a1414';
  const P = Array.isArray(o.pose) ? o.pose : (POSES[o.pose || 'stand'] || POSES.stand);
  const sit = o.pose === 'sit';
  const hipY = -46, shY = -76;
  // legs
  if (!o.dress || o.pose === 'run' || o.pose === 'walk' || o.pose === 'dance') {
    if (sit) { line(0, hipY, 18, hipY, bot, 10); line(18, hipY, 18, 0, bot, 9); line(-3, hipY, 14, hipY + 2, bot, 10); line(14, hipY + 2, 12, 0, bot, 9); ell(21, -2, 6, 3, shoes); ell(15, -2, 6, 3, shoes); }
    else { const [ax, ay] = limb(0, hipY, P[2], 44, 10, bot); const [bx, by] = limb(0, hipY, P[3], 44, 10, bot); ell(ax + 3, ay + 1, 7, 3.5, shoes); ell(bx + 3, by + 1, 7, 3.5, shoes); }
  }
  // cape / wings behind
  if (o.wings) { c.save(); c.globalAlpha *= 0.92; svg('M-4 -72 C -40 -110 -70 -80 -60 -30 C -45 -50 -30 -48 -6 -50 Z', S || o.wings, 0, 0, 1); svg('M4 -72 C 30 -120 64 -96 58 -40 C 44 -56 30 -54 6 -52 Z', S || o.wings, 0, 0, 1); c.restore(); }
  if (o.cape) poly([-10, shY, 10, shY, 22, -6, -22, -6], S || o.cape);
  // torso
  if (o.dress) { poly([-9, shY - 3, 9, shY - 3, 22, -6, -22, -6], top); if (!o.long) { limb(-4, -10, P[2] * 0.4, 12, 6, skin); limb(4, -10, P[3] * 0.4, 12, 6, skin); } }
  else if (o.coat) { poly([-12, shY - 3, 12, shY - 3, 16, -14, -16, -14], o.coat === true ? top : (S || o.coat)); }
  else rr(-11, shY - 4, 22, 36, 7, top);
  if (o.tie && !S) poly([-1.5, shY - 2, 1.5, shY - 2, 2.5, shY + 18, 0, shY + 22, -2.5, shY + 18], o.tie);
  if (o.shirt && !S) poly([-5, shY - 3, 5, shY - 3, 0, shY + 10], o.shirt);
  // arms
  const armCol = S || o.arms || top;
  limb(-3, shY, P[1], 34, 7.5, armCol, skin, 4.5);
  // head
  const hy = -92;
  rect(-3, shY - 10, 6, 8, skin);
  circ(0, hy, 11, skin);
  if (!S && (o.eyes ?? (h > 28))) { circ(5, hy - 1, 1.3, '#1a1010'); circ(-1, hy - 1, 1.3, '#1a1010'); if (o.smile) { c.beginPath(); c.arc(3, hy + 3, 3.5, 0.2, Math.PI - 0.2); c.strokeStyle = '#5a2020'; c.lineWidth = 1; c.stroke(); } }
  if (o.glasses) { rect(-3, hy - 3.5, 12, 4, S || o.glasses); }
  const hs = o.hairStyle || 'short';
  if (hs === 'short') { c.beginPath(); c.arc(0, hy - 1, 11.6, Math.PI * 1.05, Math.PI * 2.02); c.fillStyle = hair; c.fill(); rect(-11, hy - 3, 5, 7, hair); }
  else if (hs === 'long') { c.beginPath(); c.arc(0, hy - 1, 12, Math.PI * 1.0, Math.PI * 2.0); c.fillStyle = hair; c.fill(); rr(-13, hy - 4, 9, 26, 4, hair); rect(-6, hy - 12, 15, 4, hair); }
  else if (hs === 'bob') { c.beginPath(); c.arc(0, hy - 2, 12.5, Math.PI * 1.0, Math.PI * 2.0); c.fillStyle = hair; c.fill(); rr(-13.5, hy - 4, 8, 15, 3, hair); rr(9, hy - 4, 4, 13, 2, hair); rect(-6, hy - 12, 17, 6, hair); }
  else if (hs === 'bun') { c.beginPath(); c.arc(0, hy - 1, 11.6, Math.PI, Math.PI * 2); c.fillStyle = hair; c.fill(); circ(-8, hy - 9, 6, hair); }
  else if (hs === 'spiky') { poly([-12, hy - 2, -10, hy - 16, -5, hy - 10, -2, hy - 19, 2, hy - 11, 6, hy - 18, 8, hy - 9, 13, hy - 12, 11, hy - 2], hair); }
  else if (hs === 'curly') { for (let i = 0; i < 7; i++) circ(-10 + i * 3.4, hy - 9 + Math.sin(i * 1.7) * 2, 5, hair); circ(-11, hy, 5, hair); }
  else if (hs === 'beard') { c.beginPath(); c.arc(0, hy - 1, 11.6, Math.PI * 1.05, Math.PI * 2.02); c.fillStyle = hair; c.fill(); c.beginPath(); c.arc(1, hy + 2, 11, 0.1, Math.PI - 0.3); c.fill(); }
  const hat = o.hat;
  const hc = S || o.hatCol || '#2a2420';
  if (hat === 'fedora') { ell(0, hy - 8, 17, 3.5, hc); rr(-9, hy - 19, 18, 12, 4, hc); rect(-9, hy - 11, 18, 2.5, S || '#111'); }
  else if (hat === 'top') { rect(-14, hy - 10, 28, 3, hc); rect(-9, hy - 32, 18, 23, hc); }
  else if (hat === 'cap') { c.beginPath(); c.arc(0, hy - 4, 11.5, Math.PI, 0); c.fillStyle = hc; c.fill(); rect(4, hy - 6, 14, 3, hc); }
  else if (hat === 'beret') { ell(-2, hy - 10, 13, 5, hc, -0.15); circ(-2, hy - 15, 1.5, hc); }
  else if (hat === 'helmet') { c.beginPath(); c.arc(0, hy - 2, 13.5, Math.PI, 0); c.fillStyle = hc; c.fill(); rect(-14, hy - 3, 28, 3, hc); }
  else if (hat === 'crown') { poly([-10, hy - 8, -10, hy - 20, -5, hy - 13, 0, hy - 22, 5, hy - 13, 10, hy - 20, 10, hy - 8], S || '#e8c040'); }
  else if (hat === 'turban') { ell(0, hy - 9, 14, 8, hc); circ(0, hy - 13, 2.5, S || '#e8c040'); }
  else if (hat === 'cowboy') { ell(0, hy - 8, 20, 4, hc); rr(-9, hy - 20, 18, 13, 5, hc); }
  else if (hat === 'headband') { rect(-12, hy - 6, 24, 4, S || o.hatCol || '#ddd'); line(-11, hy - 4, -20, hy + 4, S || o.hatCol || '#ddd', 2); }
  else if (hat === 'straw') { ell(0, hy - 8, 22, 4, S || '#d6b36a'); rr(-9, hy - 17, 18, 10, 4, S || '#d6b36a'); }
  else if (hat === 'kasa') { poly([-24, hy - 4, 0, hy - 18, 24, hy - 4], S || '#c9a560'); }
  else if (hat === 'chef') { rr(-10, hy - 30, 20, 22, 8, S || '#f4f4f4'); }
  if (o.scarf && !S) { rect(-8, shY - 6, 16, 5, o.scarf); line(6, shY - 3, 12, shY + 14, o.scarf, 4); }
  // front arm last
  limb(3, shY, P[0], 34, 7.5, armCol, skin, 4.5);
  if (o.prop) { const ex = 3 + Math.sin(P[0]) * 34, ey = shY + Math.cos(P[0]) * 34; c.save(); c.translate(ex, ey); o.prop(); c.restore(); }
  c.restore();
}
// a head-and-shoulders close-up (for portraits / reaction shots)
function bust(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const skin = o.skin || '#e2b48e', hair = o.hair || '#3b2a1c', top = o.top || '#333';
    poly([-70, 120, -55, 60, -20, 45, 20, 45, 55, 60, 70, 120], top);
    if (o.collar) poly([-18, 45, 0, 75, 18, 45, 10, 42, 0, 58, -10, 42], o.collar);
    rect(-12, 20, 24, 30, skin);
    ell(0, 0, 30, 38, skin);
    const hs = o.hairStyle || 'short';
    c.fillStyle = hair;
    if (hs === 'short') { c.beginPath(); c.ellipse(0, -10, 32, 32, 0, Math.PI * 1.02, Math.PI * 1.98); c.fill(); }
    if (hs === 'bob') { c.beginPath(); c.ellipse(0, -8, 36, 36, 0, Math.PI, Math.PI * 2); c.fill(); rr(-37, -12, 12, 44, 5, hair); rr(25, -12, 12, 44, 5, hair); rect(-26, -40, 52, 22, hair); }
    if (hs === 'long') { c.beginPath(); c.ellipse(0, -10, 35, 34, 0, Math.PI, Math.PI * 2); c.fill(); rr(-38, -14, 13, 72, 6, hair); rr(25, -14, 13, 72, 6, hair); rect(-24, -40, 48, 16, hair); }
    if (hs === 'spiky') poly([-32, -4, -30, -40, -18, -30, -10, -50, 0, -34, 10, -52, 16, -32, 30, -44, 32, -4, 24, -22, -24, -22], hair);
    if (hs === 'wave') { c.beginPath(); c.ellipse(-4, -12, 36, 30, -0.2, Math.PI * 0.95, Math.PI * 2.0); c.fill(); ell(-24, -4, 14, 22, hair); }
    const eyeY = o.eyeY ?? -2;
    if (o.wink) { line(-16, eyeY, -6, eyeY + 1, '#201010', 2.5); } else { ell(-11, eyeY, 4, o.wide ? 5 : 3, '#fff'); circ(-11 + (o.look || 0), eyeY, 2.2, '#201010'); }
    ell(11, eyeY, 4, o.wide ? 5 : 3, '#fff'); circ(11 + (o.look || 0), eyeY, 2.2, '#201010');
    line(-17, eyeY - 8, -5, eyeY - (o.brow ?? 9), hair, 2.5); line(5, eyeY - (o.brow ?? 9), 17, eyeY - 8, hair, 2.5);
    line(0, eyeY + 4, -3, eyeY + 14, 'rgba(0,0,0,0.25)', 1.5);
    if (o.mouth === 'o') ell(0, 22, 5, 7, '#5a1818');
    else if (o.mouth === 'grin') { c.beginPath(); c.arc(0, 14, 11, 0.25, Math.PI - 0.25); c.strokeStyle = '#5a1818'; c.lineWidth = 2.5; c.stroke(); }
    else line(-7, 21, 7, 21, '#7a3030', 2.5);
    if (o.lips) ell(0, 21, 8, 3.5, o.lips);
    if (o.glasses) { rr(-24, eyeY - 8, 19, 13, 4, o.glasses); rr(5, eyeY - 8, 19, 13, 4, o.glasses); line(-5, eyeY - 3, 5, eyeY - 3, o.glasses, 2); }
    if (o.hat === 'fedora') { ell(0, -30, 50, 9, o.hatCol || '#222'); rr(-28, -62, 56, 32, 10, o.hatCol || '#222'); rect(-28, -38, 56, 6, '#111'); }
    if (o.hat === 'wide') { ell(0, -30, 70, 12, o.hatCol || '#222'); rr(-26, -56, 52, 28, 12, o.hatCol || '#222'); }
    if (o.extra) o.extra();
  });
}

// ---------------------------------------------------------------- animals
function dog(x, y, s, col = '#b07840', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const d = col, dk = o.dark || 'rgba(0,0,0,0.25)';
    const lp = o.run ? wob(0.5, 2) : 0;
    limb(-14, -14, 0.3 + lp, 14, 5, d); limb(12, -14, -0.2 - lp, 14, 5, d);
    ell(0, -18, 20, 9, d);
    limb(-10, -14, -0.2 - lp, 14, 5, d); limb(16, -14, 0.25 + lp, 14, 5, d);
    line(-19, -20, -28, -30 + wob(2, 2), d, 3.5);
    ell(22, -30, 9, 8, d); ell(30, -27, 6, 4, d); circ(35, -28, 2, '#111');
    ell(17, -33, 3.5, 7, o.ear || dk, 0.4); circ(24, -32, 1.4, '#111');
    if (o.tongue) ell(31, -22, 2, 3.5, '#e06070');
    if (o.collar) rect(13, -26, 5, 8, o.collar);
  });
}
function cat(x, y, s, col = '#444', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    ell(0, -14, 13, 14, col); circ(0, -32, 10, col);
    poly([-9, -36, -7, -48, -2, -40], col); poly([9, -36, 7, -48, 2, -40], col);
    c.beginPath(); c.moveTo(10, -6); c.quadraticCurveTo(30, -4, 26, -26 + wob(2)); c.strokeStyle = col; c.lineWidth = 3.5; c.lineCap = 'round'; c.stroke();
    if (o.eyes !== false) { ell(-4, -33, 2.2, 2.8, o.eyeCol || '#d8e050'); ell(4, -33, 2.2, 2.8, o.eyeCol || '#d8e050'); rect(-4.5, -35, 1, 4, '#111'); rect(3.5, -35, 1, 4, '#111'); }
  });
}
function goat(x, y, s, col = '#e8e0d0', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const lg2 = o.legs ?? [0.1, -0.1, 0.15, -0.15];
    limb(-12, -16, lg2[0], 16, 4, col); limb(12, -16, lg2[1], 16, 4, col);
    ell(0, -22, 19, 10, col); limb(-8, -16, lg2[2], 16, 4, col); limb(15, -16, lg2[3], 16, 4, col);
    poly([14, -28, 22, -42, 28, -38, 22, -24], col);
    ell(28, -40, 8, 6, col, 0.5); ell(34, -36, 5, 4, col, 0.4);
    c.beginPath(); c.moveTo(24, -45); c.quadraticCurveTo(16, -58, 10, -48); c.strokeStyle = o.horn || '#7a6a50'; c.lineWidth = 3; c.stroke();
    poly([34, -33, 37, -26, 31, -31], o.beard || '#bbb'); circ(29, -42, 1.4, '#111');
    ell(22, -42, 4, 2, col, -0.4);
  });
}
function fish(x, y, s, col = '#8aa0b0', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    poly([-26, 0, -38, -12, -38, 12], o.tail || col);
    ell(0, 0, 28, 14, col);
    if (o.tux) { poly([2, -13, 18, -10, 22, 10, 2, 14], '#111'); poly([8, -11, 16, -10, 18, 8, 10, 12], '#f4f4f4'); poly([8, -11, 12, -4, 16, -10, 12, -12], '#111'); }
    ell(-2, 2, 18, 6, 'rgba(255,255,255,0.2)');
    circ(16, -4, 3.2, '#fff'); circ(17, -4, 1.7, '#111');
    poly([0, -13, 10, -22, 14, -12], o.fin || col);
    line(22, 4, 28, 5, '#333', 1.5);
    if (o.rose) { line(26, 4, 34, 0, '#2a6a2a', 1.5); circ(35, -1, 3, '#c01020'); }
  });
}
function seal(x, y, s, col = '#9a9a9a', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    svg('M -30 0 C -32 -14 -10 -22 8 -22 C 18 -30 30 -30 32 -20 C 34 -12 26 -8 20 -6 C 16 0 0 2 -30 0 Z', col);
    poly([-30, 0, -42, -8, -40, 4], col);
    ell(4, -2, 8, 3, col, 0.5);
    circ(26, -22, 2, '#111'); circ(31, -18, 1.5, '#111');
    if (o.white) ell(0, -10, 20, 8, 'rgba(255,255,255,0.25)');
  });
}
function pig(x, y, s, col = '#f0a8b0', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    limb(-10, -10, 0.1, 10, 5, col); limb(10, -10, -0.1, 10, 5, col);
    ell(0, -18, 20, 12, col); limb(-6, -10, -0.1, 10, 5, col); limb(14, -10, 0.1, 10, 5, col);
    circ(20, -24, 9, col); ell(28, -23, 4, 5, '#e08890'); circ(28, -24, 0.9, '#702030'); circ(28, -21, 0.9, '#702030');
    poly([16, -31, 18, -38, 22, -32], col); circ(22, -27, 1.3, '#111');
    c.beginPath(); c.arc(-23, -22, 3, 0, Math.PI * 1.6); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
  });
}
function lion(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const b = o.col || '#d8a050', mane = o.mane || '#8a4a1a';
    if (!o.headOnly) { limb(-14, -14, 0.05, 15, 6, b); limb(12, -14, -0.05, 15, 6, b); ell(0, -20, 22, 10, b); limb(-8, -14, 0, 15, 6, b); limb(18, -14, 0.05, 15, 6, b); line(-21, -22, -32, -12, b, 3); circ(-33, -11, 3, mane); }
    if (!o.cub) circ(22, -32, 14, mane);
    circ(24, -32, o.cub ? 8 : 9, b); ell(30, -29, 4, 3, o.cub ? b : '#c89040'); circ(33, -30, 1.5, '#331');
    circ(26, -35, 1.3, '#111'); if (o.cub) { circ(18, -39, 3, b); }
  });
}
function trex(x, y, s, col = '#5a6a40', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    svg('M -70 -40 C -40 -50 -10 -60 10 -75 C 20 -95 40 -100 55 -95 C 70 -92 76 -84 74 -76 C 66 -72 52 -72 44 -70 C 40 -60 36 -50 28 -40 C 26 -30 22 -24 14 -20 L 18 0 L 6 0 L 4 -18 C -6 -16 -14 -18 -20 -22 L -16 0 L -28 0 L -30 -28 C -44 -32 -60 -34 -70 -40 Z', col);
    if (o.roar) { poly([46, -78, 74, -76, 70, -64, 48, -70], '#3a1a1a'); for (let i = 0; i < 4; i++) poly([50 + i * 6, -76, 53 + i * 6, -72, 56 + i * 6, -76], '#eee'); }
    if (o.snout) { ell(74, -82, 6, 7, o.snout); circ(73, -84, 1.2, '#502020'); circ(75, -80, 1.2, '#502020'); }
    circ(52, -88, 2.2, '#ee3'); line(30, -50, 38, -42, col, 4); line(38, -42, 42, -44, col, 2);
  });
}
function bronto(x, y, s, col = '#6a7a5a') {
  at(x, y, s, 1, () => {
    svg('M -60 -10 C -50 -40 20 -45 30 -25 C 40 -40 46 -80 58 -95 C 64 -102 74 -100 74 -94 C 70 -90 64 -88 62 -84 C 54 -60 50 -30 40 -12 L 36 0 L 28 0 L 26 -10 L -10 -10 L -14 0 L -22 0 L -26 -10 C -40 -8 -60 -2 -80 -6 C -70 -8 -64 -8 -60 -10 Z', col);
    circ(68, -96, 1.5, '#111');
  });
}
function penguin(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    if (o.slide) c.rotate(-1.35);
    ell(0, -20, 11, 20, '#1a1a22'); ell(3, -18, 7, 15, '#f4f4f0'); circ(1, -40, 8, '#1a1a22');
    poly([7, -41, 15, -39, 7, -37], '#e8a020'); circ(4, -42, 1.4, '#fff'); circ(4.3, -42, 0.7, '#111');
    ell(-8, -22, 3, 11, '#1a1a22', 0.3); ell(-2, 0, 5, 2, '#e8a020'); ell(5, 0, 5, 2, '#e8a020');
  });
}
function duck(x, y, s, col = '#f6d23a') {
  at(x, y, s, 1, () => {
    svg('M -26 -10 C -30 -26 -10 -26 0 -22 C 4 -36 20 -40 26 -28 C 30 -20 24 -16 18 -16 C 26 -10 22 4 0 6 C -18 8 -28 2 -26 -10 Z', col);
    poly([26, -28, 38, -24, 26, -21], '#f08a20'); circ(18, -30, 2, '#111'); ell(-4, -8, 10, 6, 'rgba(0,0,0,0.08)', -0.3);
  });
}
function orca(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    if (o.rot) c.rotate(o.rot);
    svg('M -50 0 C -40 -16 10 -22 40 -10 C 50 -6 52 4 40 6 C 10 14 -30 10 -50 0 Z', '#111');
    poly([-48, 0, -64, -12, -58, 2, -64, 12], '#111'); poly([0, -18, -6, -40, 10, -18], '#111');
    ell(22, -6, 7, 3, '#f4f4f4', -0.2); svg('M -20 4 C 0 12 30 10 40 6 C 20 2 0 2 -20 4 Z', '#f4f4f4');
  });
}
function bird(x, y, s, col = '#222') { at(x, y, s, 1, () => pline([-8, -2 - wob(2, 2), 0, 2, 8, -2 - wob(2, 2)], col, 2)); }
function snake(x, y, s, col = '#5a6a2a', ph = 0) {
  at(x, y, s, 1, () => {
    c.beginPath(); for (let i = 0; i <= 20; i++) { const xx = i * 3 - 30, yy = Math.sin(i * 0.6 + ph + M * 2) * 5; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.strokeStyle = col; c.lineWidth = 5; c.lineCap = 'round'; c.stroke(); circ(31, Math.sin(20 * 0.6 + ph + M * 2) * 5, 4, col);
  });
}
function squirrel(x, y, s, col = '#a0602a') {
  at(x, y, s, 1, () => { svg('M -6 -4 C -22 -10 -26 -34 -12 -40 C -4 -42 -2 -30 -8 -24 C -4 -16 -2 -10 -6 -4 Z', col); ell(2, -10, 7, 9, col); circ(6, -22, 5.5, col); poly([4, -27, 6, -32, 8, -26], col); circ(8, -23, 1, '#111'); });
}
function groundhog(x, y, s, col = '#8a6038') {
  at(x, y, s, 1, () => { ell(0, -16, 13, 17, col); circ(0, -34, 9, col); ell(0, -30, 5, 4, '#c8a080'); circ(-3, -37, 1.4, '#111'); circ(3, -37, 1.4, '#111'); circ(-7, -41, 2.4, col); circ(7, -41, 2.4, col); ell(0, -27, 1.8, 1.2, '#222'); limb(-9, -24, 1.2, 7, 4, col); limb(9, -24, -1.2, 7, 4, col); });
}
function clam(x, y, s, o = {}) {
  at(x, y, s, 1, () => {
    const col = o.col || '#d8c8b0', open = o.open ?? 0.4;
    svg('M -20 0 C -20 -16 20 -16 20 0 Z', col); c.save(); c.translate(0, 0); c.rotate(-open); svg('M -20 0 C -20 16 20 16 20 0 Z', col); c.restore();
    for (let i = -3; i <= 3; i++) line(i * 5, -1, i * 4, -10, 'rgba(0,0,0,0.15)', 1);
    if (o.face) { ell(0, -3, 7, 4, '#3a1515'); circ(-7, -9, 1.6, '#111'); circ(7, -9, 1.6, '#111'); }
  });
}
function salami(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const col = o.col || '#8a2f2a';
    limb(-5, -6, 0.15, 10, 3, '#3a2a20'); limb(5, -6, -0.15, 10, 3, '#3a2a20');
    rr(-11, -46, 22, 44, 11, col);
    const r2 = seeded(7); for (let i = 0; i < 9; i++) circ(-7 + r2() * 14, -40 + r2() * 34, 1.2 + r2(), '#e8c8b0');
    ell(0, -46, 4, 2, '#d8c090'); line(0, -48, 0, -54, '#d8c090', 1.5);
    circ(-4, -34, 1.6, '#fff'); circ(4, -34, 1.6, '#fff'); circ(-4, -34, 0.8, '#111'); circ(4, -34, 0.8, '#111');
    if (o.headband) rect(-11, -40, 22, 3, '#eee');
    if (o.sword) { line(10, -20, 34, -50, '#ddd', 2); line(8, -18, 13, -24, '#222', 3); }
    limb(-10, -26, 0.8, 9, 3, col); limb(10, -26, -0.8, 9, 3, col);
  });
}
function horse(x, y, s, col = '#222') {
  at(x, y, s, 1, () => {
    svg('M -30 -30 C -20 -40 20 -40 26 -34 C 34 -50 40 -60 50 -58 C 56 -56 58 -50 54 -48 C 48 -46 44 -40 40 -30 C 38 -22 30 -20 26 -20 L 30 0 L 25 0 L 20 -18 L -14 -18 L -20 0 L -25 0 L -24 -22 C -30 -22 -34 -26 -30 -30 Z', col);
    poly([-30, -30, -42, -12, -36, -28], col);
  });
}
function alienET(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const col = o.col || '#8a7a5a';
    ell(0, -18, 14, 16, col); limb(-6, -8, 0.1, 8, 5, col); limb(6, -8, -0.1, 8, 5, col);
    line(0, -30, 0, -44, col, 5); ell(6, -54, 16, 12, col);
    ell(4, -56, 4, 4, '#1a2840'); ell(14, -56, 4, 4, '#1a2840'); circ(5, -57, 1, '#fff'); circ(15, -57, 1, '#fff');
    line(8, -48, 18, -49, '#4a3a2a', 1.5);
    const [ex, ey] = limb(8, -26, o.reach ?? 1.4, 22, 3.5, col);
    if (o.glow) glow(ex, ey, 8, 'rgba(255,90,60,0.9)');
  });
}
function robotMaria(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const g = o.col || '#c9a54a', d = '#7a6020';
    rr(-7, -48, 14, 20, 4, g); limb(-4, -30, 0.08, 30, 6, g); limb(4, -30, -0.08, 30, 6, g);
    ell(0, -56, 12, 9, g); ell(-5, -54, 4, 4, d); ell(5, -54, 4, 4, d); rect(-8, -86, 16, 4, d);
    ell(0, -74, 10, 12, g); ell(-4, -74, 2.5, 1.5, '#222'); ell(4, -74, 2.5, 1.5, '#222'); line(-3, -67, 3, -67, d, 1.5);
    line(-7, -40, 7, -40, d, 1); line(-6, -36, 6, -36, d, 1);
    limb(-9, -60, o.armB ?? -0.2, 26, 4, g); limb(9, -60, o.armF ?? 0.4, 26, 4, g);
  });
}
function ghost(x, y, s, col = 'rgba(200,255,200,0.8)') {
  at(x, y + wob(2), s, 1, () => { svg('M -16 0 L -16 -26 C -16 -46 16 -46 16 -26 L 16 0 L 10 -6 L 5 0 L 0 -6 L -5 0 L -10 -6 Z', col); circ(-5, -28, 2.5, '#123'); circ(5, -28, 2.5, '#123'); ell(0, -18, 3, 4, '#123'); });
}
function skull(x, y, s, col = '#ddd', o = {}) {
  at(x, y, s, 1, () => {
    ell(0, -4, 16, 15, col); rr(-9, 6, 18, 9, 3, col);
    ell(-6, -3, 4.5, 5, o.eye || '#111'); ell(6, -3, 4.5, 5, o.eye2 || o.eye || '#111');
    poly([0, 3, -2, 7, 2, 7], '#111'); for (let i = -2; i <= 2; i++) line(i * 3.5, 8, i * 3.5, 14, '#111', 1);
  });
}

// ---------------------------------------------------------------- vehicles & big objects
function boat(x, y, s, o = {}) {
  at(x, y + wob(1), s, o.facing || 1, () => {
    poly([-30, -10, 30, -10, 24, 2, -24, 2], o.hull || '#f0ece0'); rect(-30, -12, 60, 3, o.trim || '#8a2020');
    rect(-8, -26, 18, 14, o.cabin || '#e8e0cc'); rect(-5, -23, 5, 4, '#456'); rect(3, -23, 5, 4, '#456');
    line(6, -26, 6, -48, '#555', 1.5); line(6, -46, -12, -14, '#555', 0.8);
    if (o.name) txt(o.name, 0, -4, 6, '#222', { font: 'Arial, sans-serif', weight: 'bold' });
  });
}
function liner(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    if (o.rot) c.rotate(o.rot);
    poly([-100, -14, 96, -14, 110, -30, 116, -30, 104, 8, -92, 8], o.hull || '#1a1a1a');
    rect(-92, 0, 196, 4, '#8a2018'); rect(-90, -22, 180, 9, '#f2eee4');
    for (let i = 0; i < 4; i++) { rect(-62 + i * 36, -52, 14, 30, '#d89a30'); rect(-62 + i * 36, -52, 14, 7, '#111'); }
    if (o.lights) for (let i = -88; i < 100; i += 6) rect(i, -10, 2, 2, o.lights);
    if (o.tape) { rect(-30, -14, 26, 18, o.tape); rect(40, -12, 20, 16, o.tape); }
    line(-96, -14, -110, -60, '#333', 1); line(98, -30, 120, -62, '#333', 1);
  });
}
function car(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const b = o.col || '#b02a2a';
    if (o.style === 'old') { poly([-34, -10, -30, -24, -14, -24, -10, -36, 14, -36, 18, -24, 34, -22, 36, -10], b); rect(-8, -33, 8, 8, '#9ab'); rect(3, -33, 9, 8, '#9ab'); }
    else if (o.style === 'delorean') { poly([-40, -8, -38, -18, -12, -30, 16, -30, 40, -18, 42, -8], o.col || '#b8bcc0'); poly([-8, -27, 14, -27, 26, -18, -12, -18], '#2a3a4a'); for (let i = 0; i < 5; i++) line(-36 + i * 3, -16, -34 + i * 3, -12, '#333', 1); }
    else if (o.style === 'van') { rr(-38, -40, 76, 32, 5, b); rect(18, -36, 16, 12, '#9ab'); rect(-30, -36, 40, 12, '#9ab'); }
    else if (o.style === 'jeep') { rect(-34, -24, 68, 14, b); rect(-16, -36, 2, 12, '#222'); rect(14, -36, 2, 12, '#222'); rect(-18, -38, 36, 3, '#222'); if (o.logo) circ(0, -17, 5, o.logo); }
    else if (o.style === 'ambulance') { rr(-40, -38, 80, 30, 4, b); poly([20, -38, 34, -38, 40, -26, 40, -8, 20, -8], b); rect(26, -34, 8, 8, '#9ab'); rect(-8, -50, 20, 6, '#c22'); if (o.logo) { circ(-8, -24, 9, '#fff'); o.logo(-8, -24); } }
    else { poly([-38, -10, -36, -22, -16, -24, -8, -34, 16, -34, 24, -24, 38, -22, 40, -10], b); rect(-6, -31, 9, 7, '#9ab'); rect(6, -31, 10, 7, '#9ab'); }
    circ(-22, -8, 7, '#151515'); circ(24, -8, 7, '#151515'); circ(-22, -8, 3, '#888'); circ(24, -8, 3, '#888');
    if (o.lights) { glow(40, -16, 30, o.lights); }
  });
}
function bike(x, y, s, col = '#333', o = {}) {
  at(x, y, s, o.facing || 1, () => {
    ring(-18, -12, 12, col, 2); ring(18, -12, 12, col, 2);
    pline([-18, -12, -4, -12, 6, -30, -10, -30, -18, -12], col, 2); line(-4, -12, -8, -34, col, 2); line(6, -30, 18, -12, col, 2); line(6, -30, 4, -38, col, 2); line(0, -38, 8, -38, col, 2.5); line(-12, -35, -4, -35, col, 3);
    if (o.basket) rect(8, -42, 12, 9, o.basket);
  });
}
function vespa(x, y, s, col = '#d8d0b8') {
  at(x, y, s, 1, () => { svg('M -30 -10 C -32 -26 -10 -30 0 -22 L 14 -22 L 22 -48 L 28 -48 L 22 -18 C 30 -14 32 -8 30 -6 Z', col); circ(-20, -6, 7, '#222'); circ(24, -6, 7, '#222'); line(18, -50, 30, -52, '#333', 2); });
}
function jet(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    if (o.rot) c.rotate(o.rot);
    const col = o.col || '#8a96a0';
    poly([-40, -2, 30, -4, 44, 0, 30, 4, -40, 3], col); poly([-4, 0, -22, -24, -14, -24, 10, 0], col); poly([-4, 0, -22, 22, -14, 22, 10, 0], o.col2 || col);
    poly([-38, 0, -46, -14, -40, -14, -30, 0], col); ell(20, -3, 8, 3, '#2a3a50');
    if (o.flame) poly([-40, -2, -56 - wob(4, 3), 0, -40, 3], '#ff9a30');
  });
}
function heli(x, y, s, col = '#222', o = {}) {
  at(x, y + wob(1), s, o.facing || 1, () => {
    ell(0, 0, 22, 11, col); line(-14, 0, -48, -4, col, 4); poly([-50, -12, -44, -4, -50, 4], col);
    line(-40 + wob(30, 4), -14, 40 - wob(30, 4), -14, col, 2); line(0, -11, 0, -14, col, 3);
    ell(10, -2, 8, 6, o.glass || 'rgba(140,170,190,0.6)'); line(-12, 12, 14, 12, col, 2); line(-8, 9, -8, 12, col, 2); line(8, 9, 8, 12, col, 2);
  });
}
function truck(x, y, s, o = {}) {
  at(x, y, s, o.facing || 1, () => {
    const b = o.col || '#5a3a2a';
    rect(-80, -44, 90, 30, o.tank || '#8a8070'); ell(-80, -29, 8, 15, o.tank || '#8a8070');
    rect(14, -50, 30, 36, b); rect(30, -46, 12, 12, '#9ab'); rect(44, -30, 10, 16, b);
    for (const wx of [-66, -46, 22, 44]) { circ(wx, -12, 9, '#151515'); circ(wx, -12, 3, '#666'); }
    for (let i = 0; i < 6; i++) line(-76 + i * 14, -44, -74 + i * 14, -54, '#333', 2);
    if (o.flames) for (let i = 0; i < 3; i++) poly([40 + i * 4, -50, 37 + i * 4, -70 - wob(5, 3, i), 44 + i * 4, -50], '#ff9030');
  });
}
function tree(x, y, s, col = '#3a5a2a', trunk = '#4a3020', seed = 1) {
  at(x, y, s, 1, () => { rect(-3, -30, 6, 30, trunk); const r = seeded(seed); for (let i = 0; i < 6; i++) circ(-10 + r() * 20, -38 - r() * 22, 10 + r() * 6, col); });
}
function pine(x, y, s, col = '#24402a') { at(x, y, s, 1, () => { rect(-2, -10, 4, 10, '#3a2a1a'); poly([-14, -8, 0, -60, 14, -8], col); poly([-11, -26, 0, -70, 11, -26], col); }); }
function palm(x, y, s, col = '#1a2a1a', lean = 0.2) {
  at(x, y, s, 1, () => {
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(lean * 30, -40, lean * 60, -80); c.strokeStyle = col; c.lineWidth = 5; c.stroke();
    const tx = lean * 60, ty = -80;
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.5 + wob(0.04); c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * 25, ty + Math.sin(a) * 25 - 8, tx + Math.cos(a) * 40, ty + Math.sin(a) * 40 + 10); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); }
  });
}
function lamppost(x, y, s, col = '#222', lit = 'rgba(255,230,160,0.55)') { at(x, y, s, 1, () => { rect(-2, -90, 4, 90, col); rect(-6, -98, 12, 10, col); if (lit) glow(0, -92, 50, lit); rect(-4, -96, 8, 5, '#ffeeb0'); }); }
function eiffel(x, y, s, col = '#3a3a3a') {
  at(x, y, s, 1, () => {
    svg('M -40 0 C -26 -30 -12 -70 -6 -130 L -3 -170 L 3 -170 L 6 -130 C 12 -70 26 -30 40 0 L 26 0 C 16 -20 6 -26 0 -26 C -6 -26 -16 -20 -26 0 Z', col);
    rect(-20, -60, 40, 4, col); rect(-12, -110, 24, 3, col); line(0, -170, 0, -190, col, 1.5);
  });
}
function column(x, y, s, col = '#ccc') { at(x, y, s, 1, () => { rect(-10, -150, 20, 150, col); rect(-16, -10, 32, 10, col); rect(-14, -156, 28, 8, col); for (let i = -6; i <= 6; i += 4) line(i, -148, i, -10, 'rgba(0,0,0,0.12)', 1.5); }); }
function castle(x, y, s, col = '#222', o = {}) {
  at(x, y, s, 1, () => {
    rect(-50, -60, 100, 60, col); rect(-70, -100, 30, 100, col); rect(40, -110, 30, 110, col); rect(-14, -130, 28, 70, col);
    poly([-74, -100, -55, -130, -36, -100], col); poly([36, -110, 55, -145, 74, -110], col); poly([-18, -130, 0, -165, 18, -130], col);
    for (let i = -50; i < 50; i += 10) rect(i, -66, 6, 6, col);
    if (o.lit) { rect(-4, -110, 6, 9, o.lit); rect(50, -80, 5, 8, o.lit); rect(-60, -70, 5, 8, o.lit); glow(-1, -106, 16, 'rgba(255,220,120,0.5)'); }
  });
}
function table(x, y, w, col = '#6a4a2a', cloth) {
  if (cloth) { poly([x - w / 2, y, x + w / 2, y, x + w / 2 + 6, y + 30, x - w / 2 - 6, y + 30], cloth); }
  else { rect(x - w / 2, y, w, 5, col); rect(x - w / 2 + 6, y + 5, 4, 35, col); rect(x + w / 2 - 10, y + 5, 4, 35, col); }
}
function desk(x, y, w, col = '#3a2414') { rect(x - w / 2, y, w, 8, col); rect(x - w / 2 + 4, y + 8, w - 8, 50, col); rect(x - w / 2 + 10, y + 16, w / 3, 14, 'rgba(0,0,0,0.25)'); circ(x - w / 2 + 10 + w / 6, y + 23, 1.5, '#c9a040'); }
function chair(x, y, s, col = '#5a3a20') { at(x, y, s, 1, () => { rect(-12, -22, 24, 4, col); rect(-12, -50, 4, 50, col); rect(8, -22, 4, 22, col); rect(-12, -50, 24, 4, col); }); }
function cup(x, y, s, col = '#f4f0e8', o = {}) {
  at(x, y, s, 1, () => {
    if (o.saucer !== false) ell(0, 0, 16, 3.5, col);
    poly([-10, -18, 10, -18, 7, -1, -7, -1], col); ring(12, -11, 4.5, col, 2.5);
    if (o.tea) ell(0, -18, 10, 2.5, o.tea);
    if (o.steam) for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 5, -22); c.bezierCurveTo(i * 5 + 5, -30, i * 5 - 5, -36, i * 5 + wob(2, 1, i), -44); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke(); }
  });
}
function bowl(x, y, s, col = '#e8e0d0', fill2 = '#d8b070') { at(x, y, s, 1, () => { ell(0, -12, 20, 5, fill2); c.beginPath(); c.moveTo(-20, -12); c.quadraticCurveTo(-18, 6, 0, 6); c.quadraticCurveTo(18, 6, 20, -12); c.fillStyle = col; c.fill(); }); }
function steam(x, y, n = 3, col = 'rgba(255,255,255,0.4)', h = 40) { for (let i = 0; i < n; i++) { const xx = x + (i - (n - 1) / 2) * 8; c.beginPath(); c.moveTo(xx, y); c.bezierCurveTo(xx + 8, y - h * 0.3, xx - 8, y - h * 0.6, xx + wob(3, 1, i * 0.3), y - h); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); } }
function toast(x, y, s, o = {}) {
  at(x, y, s, 1, () => {
    if (o.rot) c.rotate(o.rot);
    svg('M -16 20 L -16 -6 C -26 -10 -24 -26 -10 -26 C -4 -32 4 -32 10 -26 C 24 -26 26 -10 16 -6 L 16 20 Z', o.crust || '#a0682a');
    svg('M -12 17 L -12 -4 C -20 -8 -18 -22 -8 -22 C -3 -27 3 -27 8 -22 C 18 -22 20 -8 12 -4 L 12 17 Z', o.col || '#e0b060');
    if (o.face) { circ(-5, -6, 2, '#222'); circ(5, -6, 2, '#222'); ell(0, 4, 4, o.face === 'o' ? 5 : 2, '#4a2010'); }
    if (o.butter) rr(-6, -14, 12, 8, 2, '#f8e88a');
  });
}
function cheese(x, y, s, o = {}) {
  at(x, y, s, 1, () => { ell(0, 0, 26, 9, '#c89a3a'); rect(-26, -14, 52, 14, '#e8c860'); ell(0, -14, 26, 9, '#f2d880'); if (o.wedge) poly([0, -14, 26, -14, 20, -8], '#c89a3a'); txt('PARMA', 0, -6, 5, '#7a5a20', { font: 'Georgia', weight: 'bold' }); });
}
function cake(x, y, s, o = {}) {
  at(x, y, s, 1, () => { ell(0, 4, 32, 7, '#f4f4f4'); poly([-24, 0, 22, 0, 22, -24, -24, -12], '#7a4020'); poly([-24, -12, 22, -24, 22, -30, -24, -18], '#f4e6d4'); rect(-24, -7, 46, 3, '#f4e6d4'); circ(14, -32, 4, '#c01828'); line(14, -36, 16, -42, '#2a6a2a', 1); });
}
function pita(x, y, s, o = {}) {
  at(x, y, s, 1, () => { if (o.rot) c.rotate(o.rot); svg('M -10 20 L -22 -16 C -12 -24 12 -24 22 -16 L 10 20 Z', '#e8d0a0'); ell(0, -16, 22, 6, '#9a5a2a'); circ(-8, -18, 3, '#3a8a2a'); circ(6, -19, 3, '#d02a2a'); circ(0, -15, 2.5, '#f4f4f4'); rect(-12, 4, 24, 14, '#f4f0e8'); });
}
function noodleBowl(x, y, s, col = '#c02020') {
  at(x, y, s, 1, () => {
    ell(0, -14, 24, 6, '#f0d8a0'); for (let i = -3; i <= 3; i++) line(i * 5, -16, i * 5 + 3, -12, '#e8c070', 1.5);
    c.beginPath(); c.moveTo(-24, -14); c.quadraticCurveTo(-22, 8, 0, 8); c.quadraticCurveTo(22, 8, 24, -14); c.fillStyle = col; c.fill();
    line(10, -14, 34, -40, '#c8a060', 2); line(14, -14, 38, -36, '#c8a060', 2);
  });
}
function candycane(x, y, s, o = {}) {
  at(x, y, s, 1, () => {
    if (o.rot) c.rotate(o.rot);
    c.beginPath(); c.moveTo(0, 40); c.lineTo(0, -20); c.arc(-10, -20, 10, 0, Math.PI, true); c.strokeStyle = o.col || '#f4f0ea'; c.lineWidth = 7; c.lineCap = 'round'; c.stroke();
    c.save(); c.clip(new Path2D('M -24 -34 L 6 -34 L 6 44 L -24 44 Z')); for (let i = -4; i < 10; i++) line(-6, i * 7 - 4, 6, i * 7 - 10, o.stripe || '#c01818', 2.5); c.restore();
  });
}
function clock(x, y, r, o = {}) {
  circ(x, y, r, o.face || '#f0ead8'); ring(x, y, r, o.rim || '#2a2a2a', r * 0.1);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, o.rim || '#2a2a2a', r * 0.05); }
  const hA = (o.h ?? 10) / 12 * TAU - Math.PI / 2, mA = (o.m ?? 10) / 60 * TAU - Math.PI / 2;
  line(x, y, x + Math.cos(hA) * r * 0.5, y + Math.sin(hA) * r * 0.5, '#111', r * 0.08); line(x, y, x + Math.cos(mA) * r * 0.75, y + Math.sin(mA) * r * 0.75, '#111', r * 0.05);
}
function bed(x, y, s, o = {}) {
  at(x, y, s, 1, () => { rect(-50, -20, 100, 20, o.base || '#5a3a2a'); rr(-48, -32, 96, 14, 5, o.mat || '#e8e4f0'); rr(-46, -40, 22, 10, 4, '#fff'); if (o.sheet) rr(-24, -34, 72, 12, 4, o.sheet); rect(-52, -50, 6, 50, o.base || '#5a3a2a'); });
}
function router(x, y, s, o = {}) {
  at(x, y, s, 1, () => {
    if (o.rot) c.rotate(o.rot);
    rr(-24, -12, 48, 14, 4, o.col || '#222832'); line(-16, -12, -22, -40, '#222', 3); line(16, -12, 22, -40, '#222', 3);
    for (let i = 0; i < 4; i++) circ(-12 + i * 8, -5, 1.6, i % 2 ? '#3f6' : '#6cf');
    if (o.waves) for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(0, -20, i * 9 + wob(1), -2.4, -0.74); c.strokeStyle = 'rgba(120,220,255,0.8)'; c.lineWidth = 2; c.stroke(); }
  });
}
function chess(x, y, w, h, o = {}) {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { const sk = 1 - j * 0.07; const xx = x + (i - 4) * w / 8 * sk, yy = y + j * h / 4; poly([xx, yy, xx + w / 8 * sk, yy, xx + w / 8 * (sk - 0.07), yy + h / 4, xx - w / 8 * 0.07 * (i - 4) / 4, yy + h / 4], (i + j) % 2 ? (o.dark || '#222') : (o.light || '#ddd')); }
}
function pawn(x, y, s, col) { at(x, y, s, 1, () => { ell(0, 0, 7, 2.5, col); poly([-5, 0, 5, 0, 2, -10, -2, -10], col); circ(0, -13, 4, col); }); }
function kingPiece(x, y, s, col) { at(x, y, s, 1, () => { ell(0, 0, 8, 3, col); poly([-6, 0, 6, 0, 3, -18, -3, -18], col); rect(-5, -22, 10, 4, col); rect(-1, -30, 2, 8, col); rect(-3.5, -27, 7, 2, col); }); }
function sunglassesOn(x, y, w, col = '#111') { rr(x - w, y - w * 0.35, w * 0.9, w * 0.6, w * 0.2, col); rr(x + w * 0.1, y - w * 0.35, w * 0.9, w * 0.6, w * 0.2, col); line(x - w * 0.1, y - w * 0.15, x + w * 0.1, y - w * 0.15, col, 2); }
function crate(x, y, w, h, col = '#8a6a3a') { rect(x, y, w, h, col); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h); line(x, y, x + w, y + h, 'rgba(0,0,0,0.25)', 1.5); }
function sign(x, y, w, h, bg, s, fg = '#111', o = {}) { if (o.post) rect(x + w / 2 - 2, y + h, 4, o.post, o.postCol || '#333'); rect(x, y, w, h, bg); txt(s, x + w / 2, y + h / 2 + 1, o.size || h * 0.6, fg, { font: o.font || 'Arial Black, Impact, sans-serif', max: w - 4 }); }
function neon(s, x, y, size, col, o = {}) { txt(s, x, y, size, col, { font: o.font || '"Arial Black", Impact, sans-serif', shadow: col, blur: 12, ...o }); txt(s, x, y, size, '#fff', { font: o.font || '"Arial Black", Impact, sans-serif', ...o, shadow: undefined }); }
// ---------------------------------------------------------------- the films
// g: grade, p: which shot is the poster key art, s: one function per shot.
const ART = {};

// ===== arthouse =====
ART['the-400-bros'] = { g: 'bw', p: 2, s: [
  () => { // Paris rooftops, a boy runs past the Eiffel Tower
    sky('#9aa4ae', '#dfe3e6', 200); eiffel(300, 200, 0.95, '#555');
    skyline(205, '#5a5f66', 41, { minH: 20, maxH: 70, win: '#2a2d33', lit: 0.5, spire: 0.05 });
    for (let x = 0; x < VW; x += 22) rect(x, 150 + (x * 7) % 30, 4, 14, '#4a4e55');
    ground(205, '#6a6e72', '#4a4d50'); for (let i = 0; i < 8; i++) line(i * 60 - 30, 290, 200, 205, 'rgba(0,0,0,0.12)', 1);
    person(120 + M * 4, 270, 70, { pose: 'run', top: '#d8d8d8', bottom: '#333', hair: '#222' });
    person(40, 262, 60, { top: '#2a2a2a', hat: 'beret', bottom: '#222' });
  },
  () => { // the frat house window: a boy behind the bars
    room('#9a9a98', '#6a6a68', 230); windowBox(110, 40, 180, 150, '#2a2a2a', () => { sky('#ccd', '#eef'); skyline(190, '#7a7f88', 9, { minH: 30, maxH: 90 }); });
    for (let x = 120; x < 290; x += 18) rect(x, 40, 5, 150, '#1a1a1a');
    bust(200 + wob(1), 205, 1.25, { top: '#d0d0d0', hair: '#1a1a1a', look: 2, mouth: 'flat' });
    txt('Σ  Β  Ρ  Ο', 200, 268, 18, '#333', { spacing: 6 });
  },
  () => { // the long run to the sea
    sky('#bfc5c9', '#eef0f0', 150); sea(150, '#8c949a', '#5a6065', 'rgba(255,255,255,0.35)', 4);
    ground(215, '#c9c3b6', '#9e978a'); for (let i = 0; i < 5; i++) line(0, 214 - i * 3, VW, 212 - i * 3, 'rgba(255,255,255,0.4)', 1);
    person(150 + M * 6, 262, 46, { pose: 'run', top: '#e8e8e8', bottom: '#2a2a2a', facing: 1 });
    for (let i = 0; i < 5; i++) ell(100 - i * 22, 266 + i, 3, 1.4, 'rgba(0,0,0,0.25)');
  },
  () => { // freeze frame
    sky('#a8adb0', '#d0d3d4', 160); sea(160, '#7a8085', '#4c5156');
    bust(205, 160, 1.9, { top: '#e0e0e0', hair: '#1a1a1a', look: -3, brow: 8 });
    txt('FIN', 340, 248, 40, '#fff', { font: 'Georgia', style: 'italic', shadow: '#000', blur: 4 });
  },
] };

ART['bicycle-cheese'] = { g: 'bw', p: 0, s: [
  () => { // Rome street, a man cycles with a wheel of parmesan strapped on
    sky('#c8c8c2', '#e8e6e0', 220); skyline(215, '#a8a49c', 18, { minH: 40, maxH: 110, win: '#8a8680', lit: 0.5 }); rect(0, 30, 120, 190, '#8a8680'); rect(280, 20, 120, 200, '#7a766f');
    for (let y = 50; y < 200; y += 40) for (let x = 15; x < 110; x += 30) rect(x, y, 14, 24, '#3a3834');
    for (let y = 40; y < 200; y += 40) for (let x = 295; x < 390; x += 30) rect(x, y, 14, 24, '#3a3834');
    rect(130, 120, 50, 70, '#ddd'); txt('FORMAGGIO', 155, 140, 8, '#222'); cheese(155, 175, 0.6);
    ground(215, '#9a978e', '#6a675f'); bike(210 + M * 4, 270, 1.5, '#222');
    person(200 + M * 4, 248, 62, { pose: [1.2, 1.0, 0.6, -0.2], top: '#555', bottom: '#333', hat: 'cap', hatCol: '#444' });
    cheese(180 + M * 4, 228, 0.55);
  },
  () => { // father and son searching the market
    sky('#bbb', '#ddd', 100);
    for (let i = 0; i < 4; i++) { poly([i * 110 - 10, 90, i * 110 + 100, 90, i * 110 + 110, 115, i * 110 - 20, 115], i % 2 ? '#e8e8e8' : '#555'); rect(i * 110, 115, 95, 60, '#8a8580'); for (let k = 0; k < 3; k++) cheese(i * 110 + 20 + k * 28, 160, 0.4); }
    ground(180, '#888', '#555');
    for (let i = 0; i < 9; i++) person(20 + i * 45, 240 + (i % 3) * 8, 58, { sil: '#3a3a3a', hat: i % 2 ? 'fedora' : 'cap', pose: i % 2 ? 'walk' : 'stand' });
    person(180 + M * 2, 285, 92, { top: '#666', bottom: '#2a2a2a', hat: 'cap', hatCol: '#333', pose: 'point' });
    person(230 + M * 2, 285, 55, { top: '#999', bottom: '#333', hair: '#111', pose: 'stand', facing: -1 });
  },
  () => { // walking away, empty handed, down a long road
    sky('#c8c8c8', '#a8a8a8', 170); ground(170, '#8a8a88', '#555');
    poly([170, 170, 230, 170, 400, 290, 0, 290], '#6a6a6a');
    for (let i = 0; i < 6; i++) { tree(30 + i * 10, 180 + i * 18, 0.4 + i * 0.25, '#4a4a4a', '#333', i); tree(370 - i * 10, 180 + i * 18, 0.4 + i * 0.25, '#4a4a4a', '#333', i + 9); }
    rect(300, 100, 50, 70, '#ddd'); cheese(325, 150, 0.6); txt('PERDUTO', 325, 112, 9, '#222');
    person(190 - M * 2, 250, 62, { top: '#4a4a4a', bottom: '#2a2a2a', hat: 'cap', facing: -1, pose: 'walk' });
    person(215 - M * 2, 252, 38, { top: '#999', bottom: '#333', facing: -1, pose: 'walk' });
  },
] };

ART['seven-salamis'] = { g: 'bw', p: 1, s: [
  () => { // the village in the rain
    sky('#888', '#bbb', 150); mountains(150, 60, '#666', 13, 5);
    ground(150, '#7a7a7a', '#444'); for (let y = 160; y < 290; y += 14) line(0, y, VW, y + 6, 'rgba(255,255,255,0.18)', 1);
    for (let i = 0; i < 4; i++) { const x = 40 + i * 95, y = 170 + (i % 2) * 15; poly([x - 30, y, x, y - 30, x + 30, y], '#2a2a2a'); rect(x - 22, y, 44, 22, '#3a3a3a'); }
    for (let i = 0; i < 5; i++) person(60 + i * 70, 270, 34, { sil: '#222', hat: 'kasa', pose: 'hold' });
    rain(11, 160, 'rgba(240,240,240,0.5)', 0.25, 18);
  },
  () => { // seven salamis line up with katanas
    sky('#d0d0d0', '#9a9a9a', 200); ground(200, '#888', '#5a5a5a');
    for (let i = 0; i < 7; i++) salami(40 + i * 54, 266 + (i % 2) * 8 + (i === 3 ? wob(1) : 0), 1.7 + (i === 3 ? 0.25 : 0), { headband: true, sword: i % 2 === 0, col: ['#7a2a24', '#8a3a2a', '#6a2a2a', '#9a3a30', '#7a3020', '#8a2a30', '#6a3424'][i] });
    for (let i = 0; i < 3; i++) rect(320 + i * 20, 80, 4, 120, '#333');
    txt('七', 360, 70, 30, '#222');
  },
  () => { // charging in the mud and rain
    sky('#6a6a6a', '#9a9a9a', 170); ground(170, '#4a4a4a', '#2a2a2a');
    horse(290 - M * 6, 230, 1.6, '#151515'); person(305 - M * 6, 175, 50, { sil: '#151515', pose: 'fight', hat: 'helmet' });
    salami(140 + M * 6, 262, 2.2, { headband: true, sword: true, col: '#5a2a20' });
    for (let i = 0; i < 10; i++) ell(40 + i * 40, 280 - (i % 3) * 4, 16, 3, 'rgba(255,255,255,0.18)');
    rain(5, 220, 'rgba(240,240,240,0.55)', 0.4, 22);
  },
  () => { // four sausage-shaped burial mounds on the hill; the farmers plant
    sky('#d8d8d8', '#aaa', 160); svg('M 0 170 C 80 150 140 118 220 112 C 300 110 360 140 400 150 L 400 290 L 0 290 Z', '#777');
    for (let i = 0; i < 4; i++) { const x = 150 + i * 45, y = 114 + Math.abs(i - 1.5) * 3; ell(x, y, 17, 7, '#555'); line(x + 4, y - 5, x + 7, y - 30, '#222', 2); line(x + 1, y - 22, x + 12, y - 24, '#222', 1.5); }
    ground(200, '#999', '#666'); for (let y = 205; y < 290; y += 12) line(0, y, VW, y, 'rgba(0,0,0,0.12)', 1);
    for (let i = 0; i < 6; i++) person(30 + i * 65 + wob(1, 1, i * 0.2), 260 + (i % 2) * 14, 36, { sil: '#2a2a2a', hat: 'kasa', pose: [0.9, 0.7, 0.5, -0.3] });
  },
] };

ART['8-quarter'] = { g: 'bw', p: 0, s: [
  () => { // the director floats above the traffic jam on a kite string
    sky('#c8ccd0', '#f4f4f4', 230); clouds(81, 4, 30, 110, 'rgba(255,255,255,0.9)');
    person(210 + wob(3), 120 + wob(2, 1, 0.3), 60, { top: '#222', bottom: '#222', hat: 'fedora', glasses: '#000', pose: 'out', tie: '#555' });
    line(214, 112, 300, 290, '#333', 0.8);
    ground(230, '#888', '#555'); for (let i = 0; i < 6; i++) car(30 + i * 70, 268 + (i % 2) * 10, 0.9, { style: 'old', col: ['#333', '#555', '#2a2a2a', '#666', '#3a3a3a', '#444'][i] });
  },
  () => { // at the café, cannot decide on lunch
    room('#d8d4cc', '#8a8680', 200, { stripes: ['rgba(0,0,0,0.06)', 30] });
    person(200, 290, 150, { top: '#1a1a1a', bottom: '#1a1a1a', hat: 'fedora', glasses: '#000', pose: [2.7, 0.9, 0.06, -0.06], tie: '#666' });
    rect(86, 198, 228, 92, '#ececec'); rect(86, 198, 228, 4, '#fff'); for (let i = 0; i < 6; i++) line(100 + i * 40, 202, 96 + i * 42, 290, 'rgba(0,0,0,0.07)', 3);
    for (let i = 0; i < 7; i++) { const x = 110 + i * 30; ell(x, 198, 12, 3.5, '#fff'); circ(x, 195, 5, ['#444', '#777', '#222', '#999', '#555', '#888', '#333'][i]); }
    rr(250, 60, 90, 110, 3, '#f8f8f0'); txt('MENU', 295, 75, 12, '#222'); for (let i = 0; i < 9; i++) line(262, 92 + i * 8, 328 - (i * 13) % 30, 92 + i * 8, '#999', 1.5);
    txt('?', 150, 70, 40, '#222', { style: 'italic' });
  },
  () => { // the circle dance on the beach around the rocket scaffold
    sky('#bfc3c6', '#ececec', 170); sea(170, '#999', '#777');
    for (let i = 0; i < 6; i++) line(170 + i * 12, 40, 160 + i * 16, 210, '#222', 2); for (let y = 50; y < 210; y += 20) line(168, y, 236, y, '#222', 1.5);
    ground(205, '#d8d4cc', '#aaa');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + M * 0.3; const x = 200 + Math.cos(a) * 150, y = 245 + Math.sin(a) * 25; person(x, y, 40 + Math.sin(a) * 6, { sil: i % 3 ? '#2a2a2a' : '#eee', dress: i % 2 === 0, pose: 'out', hat: i % 4 === 0 ? 'top' : undefined }); }
  },
] };

ART['oatmelie'] = { g: 'amelie', p: 0, s: [
  () => { // the café: our waitress with a bowl of oatmeal
    room('#7a1a14', '#3a2a14', 200, { floor2: '#2a1a0a', skirting: '#1a3a14' });
    for (let x = 30; x < VW; x += 90) { rect(x, 30, 50, 80, '#1a3a1a'); glow(x + 25, 70, 50, 'rgba(255,200,80,0.25)'); }
    rect(0, 150, VW, 50, '#2a4a20'); rect(0, 146, VW, 6, '#c8a040');
    person(210 + wob(1), 278, 150, { top: '#c01a18', bottom: '#2a1a14', hair: '#1a0a08', hairStyle: 'bob', dress: true, skin: '#f0caa8', pose: 'hold', smile: true,
      prop: () => { at(4, 2, 1 / 1.5, 1, () => { bowl(0, 0, 0.9, '#f4ead8', '#e0c890'); steam(0, -14, 3, 'rgba(255,240,220,0.5)', 30); }); } });
    glow(80, 60, 90, 'rgba(255,220,120,0.25)');
  },
  () => { // skipping stones on the canal
    sky('#d8c070', '#8aa040', 120); rect(0, 90, VW, 50, '#3a5a2a');
    for (let x = -20; x < VW; x += 140) { svg('M 0 0 C 10 -40 60 -40 70 0 Z', '#d8c8a0', x + 40, 150); rect(x + 30, 146, 90, 6, '#c8b890'); }
    sea(160, '#2a6a4a', '#103a2a', 'rgba(220,255,200,0.35)', 9);
    for (let i = 0; i < 5; i++) ring(120 + i * 50, 200 + i * 3, 6 + i * 3, 'rgba(255,255,220,0.6)', 1.5);
    person(330 + wob(1), 290, 120, { top: '#b01818', hairStyle: 'bob', hair: '#1a0a08', dress: true, skin: '#f0caa8', pose: [1.8, -0.5, 0.06, -0.06], facing: -1 });
  },
  () => { // the travelling gnome in front of the Eiffel Tower
    sky('#e8d890', '#9ac0d8', 220); eiffel(200, 225, 1.1, '#5a4a3a'); hills(230, 6, '#4a7a2a', 2);
    at(140, 280, 1.6 + wob(0.02), 1, () => { ell(0, -2, 26, 6, 'rgba(0,0,0,0.3)'); poly([-18, 0, 18, 0, 14, -40, -14, -40], '#2a5ac0'); ell(0, -50, 13, 14, '#f0caa8'); poly([-14, -55, 0, -95, 14, -55], '#c01818'); svg('M -13 -48 C -14 -20 14 -20 13 -48 C 6 -40 -6 -40 -13 -48 Z', '#f4f4f4'); circ(-4, -53, 1.6, '#111'); circ(5, -53, 1.6, '#111'); ell(0, -48, 3, 2.4, '#e09080'); });
    rect(250, 230, 120, 50, '#f4f0e0'); txt('Bonjour de Paris!', 310, 255, 12, '#c01818', { style: 'italic' });
  },
  () => { // cracking the crust with a spoon
    rect(0, 0, VW, VH, '#3a2a12'); glow(200, 150, 220, 'rgba(255,200,100,0.4)');
    ell(200, 190, 150, 40, '#f4ead4'); ell(200, 178, 130, 32, '#d89a3a'); ell(200, 176, 118, 26, '#e8b050');
    for (let i = 0; i < 6; i++) circ(140 + i * 22, 170 + (i % 2) * 8, 6, '#b0182a');
    c.save(); c.translate(270 + wob(2), 120 + M * 3); c.rotate(0.7); ell(0, 0, 14, 22, '#c8c8d0'); rect(-3, 18, 6, 90, '#c8c8d0'); c.restore();
    pline([210, 172, 220, 168, 228, 176, 238, 170], '#6a3a10', 1.5);
  },
] };

ART['nosferatwo'] = { g: 'silent', p: 0, s: [
  () => { // the shadow on the stairs, again
    rect(0, 0, VW, VH, '#c8c0b0');
    for (let i = 0; i < 9; i++) { poly([40 + i * 34, 290 - i * 30, 80 + i * 34, 290 - i * 30, 80 + i * 34, 290, 40 + i * 34, 290], '#a8a090'); line(40 + i * 34, 290 - i * 30, 80 + i * 34, 290 - i * 30, '#7a7468', 2); }
    line(30, 280, 330, 20, '#5a5448', 3);
    const sx = 130 + M * 5;
    svg('M 0 0 C -6 -30 -2 -60 6 -80 C 0 -90 2 -104 12 -106 C 22 -108 26 -96 22 -84 C 34 -70 40 -40 40 0 Z', 'rgba(20,16,12,0.85)', sx, 230, 1.4);
    svg('M 30 -70 C 60 -80 80 -96 96 -120 L 100 -118 L 92 -100 L 104 -112 L 104 -106 L 94 -94 L 108 -100 L 100 -88 C 80 -74 56 -64 34 -58 Z', 'rgba(20,16,12,0.85)', sx, 230, 1.4);
    poly([sx + 12, 85, sx + 6, 70, sx + 18, 82], 'rgba(20,16,12,0.85)'); poly([sx + 32, 82, sx + 38, 68, sx + 26, 80], 'rgba(20,16,12,0.85)');
  },
  () => { // the castle on the crag at dusk
    sky('#5a5448', '#a8a088', 230); moon(320, 60, 18);
    svg('M 0 290 L 0 200 C 40 190 60 150 100 140 C 140 130 150 90 190 80 C 230 90 240 140 280 150 C 320 160 360 200 400 210 L 400 290 Z', '#2a2620');
    castle(190, 90, 0.55, '#1a1612', { lit: '#e8d8a0' });
    for (let i = 0; i < 5; i++) bird(80 + i * 30 + M * 6, 50 + (i % 2) * 14, 1.2, '#1a1612');
    sea(240, '#3a3428', '#2a2418');
  },
  () => frameCard(['And so the shadow', 'returned to Wisborg...', 'for the sequel.'], { logo: 'N.2', size: 24 }),
] };

ART['metropolice'] = { g: 'silver', p: 0, s: [
  () => { // the city of tomorrow
    sky('#7a7a80', '#c8c8c8'); glow(200, 60, 200, 'rgba(255,255,255,0.4)');
    skyline(290, '#5a5a60', 77, { minH: 120, maxH: 260, minW: 20, varW: 30, win: '#e8e8e0', lit: 0.25, stepped: 0.6, spire: 0.3 });
    rect(170, 30, 60, 260, '#3a3a40'); poly([170, 30, 200, 0, 230, 30], '#3a3a40'); for (let y = 40; y < 290; y += 10) rect(178, y, 44, 3, '#c8c8c0');
    for (let i = 0; i < 3; i++) { rect(0, 120 + i * 45, VW, 5, '#2a2a2e'); }
    for (let i = 0; i < 4; i++) jet(60 + i * 90 + M * 8, 50 + i * 18, 0.35, { col: '#2a2a2a' });
    for (let i = 0; i < 8; i++) car(30 + i * 45 + M * 5, 120, 0.25, { style: 'old', col: '#222' });
  },
  () => { // the robot writes a parking ticket
    rect(0, 0, VW, 220, '#8a8a8e'); for (let x = 0; x < VW; x += 50) rect(x, 0, 30, 220, '#7a7a7e');
    ground(220, '#6a6a6a', '#4a4a4a');
    car(110, 270, 2.0, { style: 'old', col: '#2a2a2a' }); rr(100, 205, 30, 10, 2, '#f4f4f4');
    rect(240, 160, 6, 110, '#333'); rr(232, 140, 22, 26, 6, '#555'); txt('0', 243, 153, 10, '#ddd');
    robotMaria(300, 272, 1.85, { armF: 2.2 + wob(0.05), armB: 0.6 });
    rr(330, 140, 22, 30, 2, '#f8f8f0'); for (let i = 0; i < 4; i++) line(334, 148 + i * 5, 348, 148 + i * 5, '#555', 1);
  },
  () => { // the shift change: workers in lockstep under the ten-hour clock
    rect(0, 0, VW, VH, '#3a3a3e'); clock(200, 70, 50, { face: '#d8d8d0', h: 9, m: 50 });
    for (let i = 0; i < 10; i++) txt(String(i + 1), 200 + Math.cos(i / 10 * TAU - Math.PI / 2) * 38, 70 + Math.sin(i / 10 * TAU - Math.PI / 2) * 38, 8, '#222');
    rect(0, 140, VW, 150, '#2a2a2e');
    for (let r2 = 0; r2 < 3; r2++) for (let i = 0; i < 9; i++) person(20 + i * 45 + r2 * 15 + M * 4, 200 + r2 * 40, 50 + r2 * 10, { sil: ['#1a1a1c', '#141416', '#0e0e10'][r2], pose: 'walk', hat: 'cap' });
  },
  () => frameCard(['THE MEDIATOR BETWEEN', 'HEAD AND HANDS', 'MUST BE THE METER.'], { size: 22, font: '"Arial Black", Impact, sans-serif', logo: '' }),
] };

ART['seventh-seal-pup'] = { g: 'bw', p: 0, s: [
  () => { // knight and seal pup at the chessboard on the rocky shore
    sky('#b8b8b8', '#ececec', 150); sea(150, '#8a8a8a', '#5a5a5a');
    ground(205, '#6a6a6a', '#3a3a3a'); svg('M 0 210 C 60 190 120 200 180 210 L 180 290 L 0 290 Z', '#4a4a4a');
    rect(165, 220, 70, 4, '#222'); chess(200, 205, 70, 18, { dark: '#222', light: '#ccc' });
    person(120, 280, 110, { top: '#555', bottom: '#333', hair: '#ddd', hairStyle: 'short', pose: 'sit', cape: '#2a2a2a' });
    seal(280 + wob(1), 260, 1.6, '#cfcfcf', { facing: -1, white: true });
  },
  () => { // the dance on the hilltop
    sky('#d8d8d8', '#888', 210); hills(210, 18, '#1a1a1a', 4, 0.6);
    for (let i = 0; i < 6; i++) { const x = 60 + i * 50 + M * 3, y = 196 - Math.sin(x / 400 * Math.PI) * 10; person(x, y, 36, { sil: '#111', pose: i === 0 ? [2.2, -0.3, 0.3, -0.3] : 'walk', hat: i === 0 ? 'helmet' : undefined, cape: i === 0 ? '#111' : undefined }); if (i < 5) line(x + 5, y - 30, x + 45, y - 30, '#111', 1.5); }
    seal(370, 190 - 5, 0.6, '#111');
    if (true) line(55, 200, 50, 140, '#111', 2);
  },
  () => { // the seal's flipper moves the queen. Checkmate.
    rect(0, 0, VW, VH, '#222'); glow(200, 150, 220, 'rgba(255,255,255,0.18)');
    chess(200, 150, 400, 140, { dark: '#2a2a2a', light: '#b8b8b8' });
    kingPiece(120, 230, 2.4, '#eee'); kingPiece(260, 200, 2.0, '#111'); pawn(320, 260, 2.2, '#eee'); pawn(80, 190, 1.6, '#111');
    svg('M 0 0 C 20 -10 60 -10 80 4 C 70 12 30 14 0 8 Z', '#9a9a9a', 270 + M * 4, 110, 1.6);
    txt('“Schack matt.”', 200, 40, 20, '#eee', { style: 'italic' });
  },
] };

ART['citizen-cane'] = { g: 'noir', p: 0, s: [
  () => { // Xanadu on the hill, one lit window, NO TRESPASSING
    sky('#1a1a1a', '#6a6a6a', 200); stars(60, 4, 120); moon(330, 50, 14); fog(120, 200, 'rgba(200,200,200,0.35)');
    svg('M 0 290 L 0 220 C 80 200 140 150 200 140 C 260 150 320 200 400 220 L 400 290 Z', '#2a2a2a');
    castle(200, 150, 0.5, '#0a0a0a'); rect(196, 92, 4, 6, '#fff'); glow(198, 95, 14, 'rgba(255,255,255,0.4)');
    for (let x = 0; x < VW; x += 14) rect(x, 200, 3, 90, '#050505'); rect(0, 210, VW, 3, '#050505'); rect(0, 240, VW, 3, '#050505');
    rect(170, 230, 60, 22, '#ddd'); txt('NO TRESPASSING', 200, 241, 6.5, '#111', { font: 'Arial Black' });
  },
  () => { // the snow globe, the candy cane, the hand
    rect(0, 0, VW, VH, '#151515'); glow(200, 140, 170, 'rgba(255,255,255,0.15)');
    at(200 + wob(1), 215, 1, 1, () => { ell(0, 0, 70, 22, '#c8b8a8'); for (let i = 0; i < 4; i++) rr(-56 + i * 26, -26, 20, 34, 9, '#c8b8a8'); rr(52, -14, 34, 16, 8, '#c8b8a8'); rect(-80, 10, 160, 80, '#c8b8a8'); });
    circ(200, 140, 70, 'rgba(220,230,240,0.25)'); ring(200, 140, 70, 'rgba(255,255,255,0.5)', 2);
    candycane(205, 140, 1.1); rect(150, 196, 100, 18, '#2a2420');
    snow(9, 40, 'rgba(255,255,255,0.9)'); clipCirc(200, 140, 68, () => snow(22, 30));
    ell(170, 105, 16, 8, 'rgba(255,255,255,0.35)', -0.6);
  },
  () => { // the rally: CANE FOR GOVERNOR
    rect(0, 0, VW, VH, '#2a2a2a'); rect(40, 10, 320, 180, '#d8d8d8');
    bust(200, 90, 0.95, { top: '#222', hair: '#333', collar: '#fff', brow: 7, mouth: 'flat' });
    rect(40, 160, 320, 30, '#111'); txt('CANE  for  GOVERNOR', 200, 175, 20, '#eee', { font: '"Arial Black", Impact', spacing: 2 });
    rect(170, 200, 60, 50, '#555'); person(200, 210, 50, { top: '#111', bottom: '#111', pose: 'wave', hair: '#555' });
    for (let i = 0; i < 16; i++) person(i * 26, 300 - (i % 2) * 8, 60, { sil: '#0a0a0a', hat: i % 3 ? 'fedora' : undefined });
  },
  () => { // into the furnace
    rect(0, 0, VW, VH, '#0a0a0a'); rr(80, 60, 240, 190, 12, '#2a2a2a'); rect(110, 90, 180, 140, '#111');
    clip(110, 90, 180, 140, () => { rect(110, 90, 180, 140, '#ffb040'); for (let i = 0; i < 9; i++) poly([110 + i * 22, 230, 120 + i * 22 + wob(4, 3, i * 0.1), 120 + (i % 3) * 20, 132 + i * 22, 230], i % 2 ? '#fff0c0' : '#ff7020'); });
    candycane(200, 170, 1.4, { rot: -1.2, col: '#f8f0e0', stripe: '#600' }); txt('CANEBUD', 200, 186, 9, '#300', { font: 'Georgia', weight: 'bold' });
  },
] };

ART['casa-blanket'] = { g: 'bw', p: 1, s: [
  () => { // Rick's: piano, arches, ceiling fans
    room('#8a8a86', '#3a3a38', 200);
    for (let i = 0; i < 4; i++) { const x = 20 + i * 100; svg('M 0 0 L 0 -90 C 0 -130 70 -130 70 -90 L 70 0 Z', '#2a2a2a', x, 170); clip(x, 50, 70, 120, () => { rect(x, 50, 70, 120, '#c8c8c8'); palm(x + 40, 175, 0.6, '#555'); }); }
    for (let i = 0; i < 3; i++) { const x = 70 + i * 130; line(x, 0, x, 18, '#222', 2); line(x - 30 + wob(25, 3, i), 20, x + 30 - wob(25, 3, i), 20, '#222', 3); }
    rr(150, 200, 120, 50, 4, '#151515'); rect(160, 196, 100, 8, '#eee'); for (let k = 0; k < 14; k++) rect(162 + k * 7, 196, 3, 5, '#111');
    person(210, 286, 80, { top: '#f0f0f0', bottom: '#222', hair: '#111', pose: 'sit', tie: '#111' });
    person(320, 290, 110, { top: '#f4f4f4', bottom: '#111', hair: '#111', tie: '#111', facing: -1, prop: () => cup(0, 0, 0.4, '#ddd', { saucer: false }) });
  },
  () => { // the airport in the fog, two people in one blanket
    sky('#5a5a5a', '#8a8a8a', 220); ground(220, '#3a3a3a', '#1a1a1a');
    jet(270, 160, 1.6, { col: '#222' }); line(330 - wob(20, 5), 130, 330 + wob(20, 5), 190, '#111', 3);
    lamppost(90, 240, 1.4, '#111', 'rgba(255,255,255,0.35)');
    svg('M -40 0 C -44 -60 -30 -100 0 -110 C 30 -100 44 -60 40 0 Z', '#9a9a9a', 170 + wob(1), 270, 1);
    for (let i = 0; i < 5; i++) line(140 + i * 14, 175, 135 + i * 16, 268, 'rgba(0,0,0,0.25)', 3);
    circ(158, 160, 12, '#ddd'); circ(182, 162, 12, '#ddd'); ell(158, 152, 14, 6, '#222'); ell(182, 150, 18, 4, '#222'); rr(174, 136, 16, 12, 4, '#222');
    fog(150, 290, 'rgba(220,220,220,0.5)');
  },
  () => { // her close-up, soft focus, blanket over her shoulders
    rect(0, 0, VW, VH, '#2a2a2a'); glow(200, 130, 200, 'rgba(255,255,255,0.35)');
    bust(200, 140, 2.0, { skin: '#e8e0d8', hair: '#3a3a3a', hairStyle: 'wave', top: '#bbb', lips: '#555', look: -2, brow: 10, hat: 'wide', hatCol: '#1a1a1a' });
    for (let i = 0; i < 7; i++) line(80 + i * 40, 240, 70 + i * 42, 290, 'rgba(0,0,0,0.2)', 6);
    rect(222, 132, 4, 3, 'rgba(255,255,255,0.9)');
  },
  () => { // the start of a beautiful nap: two figures walk off under the lamp
    sky('#3a3a3a', '#707070', 220); ground(220, '#2a2a2a', '#111');
    jet(110 - M * 10, 80 - M * 4, 0.6, { col: '#111', rot: -0.15 });
    lamppost(300, 250, 1.6, '#111', 'rgba(255,255,255,0.45)');
    person(230 + M * 2, 262, 66, { sil: '#111', hat: 'fedora', coat: true, pose: 'walk' });
    person(262 + M * 2, 262, 64, { sil: '#111', coat: true, pose: 'walk', hat: 'cap' });
    fog(160, 290, 'rgba(200,200,200,0.45)');
  },
] };

ART['sunscreen-boulevard'] = { g: 'noir', p: 0, s: [
  () => { // face down in the pool, the sunscreen bottle bobbing
    rect(0, 0, VW, VH, '#6a6a6a'); for (let i = 0; i < 12; i++) for (let k = 0; k < 9; k++) ring(20 + i * 35 + (k % 2) * 17, 20 + k * 34 + wob(2, 1, i), 14, 'rgba(255,255,255,0.12)', 1.5);
    svg('M -50 0 C -50 -10 40 -14 60 -4 C 64 0 60 8 50 8 C 20 10 -30 10 -50 0 Z', '#222', 200, 60, 1.5);
    circ(290, 64, 14, '#222'); line(150, 60, 120, 40, '#222', 8); line(240, 60, 270, 36, '#222', 8);
    rr(110 + wob(3), 140, 20, 44, 4, '#ddd'); rect(113 + wob(3), 134, 14, 8, '#222'); txt('SPF', 120 + wob(3), 160, 7, '#222', { font: 'Arial Black' });
    rect(0, 230, VW, 60, '#2a2a2a'); bust(320, 330, 0.9, { top: '#222', hair: '#111', look: -4 });
  },
  () => { // the staircase: turban, sweeping descent, a tube of SPF 50
    rect(0, 0, VW, VH, '#1a1a1a'); cone(200, -40, Math.PI / 2, 0.35, 360, 'rgba(255,255,255,0.35)');
    for (let i = 0; i < 9; i++) { const y = 290 - i * 22; ell(200 + i * 8, y, 140 - i * 6, 10, i % 2 ? '#4a4a4a' : '#3a3a3a'); }
    for (let i = 0; i < 9; i++) line(80 + i * 8, 290 - i * 22, 80 + i * 8, 270 - i * 22, '#888', 1.5);
    person(210, 180 + M * 3, 110, { top: '#eee', dress: true, long: true, skin: '#ddd', hat: 'turban', hatCol: '#ccc', pose: [2.0, -1.2, 0, 0], prop: () => { rr(-3, -12, 6, 14, 2, '#fff'); } });
  },
  () => { // ready for her close-up, zinc on the nose
    rect(0, 0, VW, VH, '#111'); cone(-20, -20, 0.8, 0.3, 400, 'rgba(255,255,255,0.3)'); cone(420, -20, Math.PI - 0.8, 0.3, 400, 'rgba(255,255,255,0.25)');
    bust(200, 150, 2.1, { skin: '#ddd', hair: '#444', hairStyle: 'wave', top: '#eee', lips: '#222', wide: true, look: 0, brow: 13,
      extra: () => { ell(0, 8, 7, 9, '#fff'); rr(-30, -14, 26, 18, 8, '#000'); rr(4, -14, 26, 18, 8, '#000'); line(-4, -8, 4, -8, '#000', 3); } });
    for (let i = 0; i < 3; i++) at(40 + i * 160, 290, 1, 1, () => { rect(-12, -40, 24, 18, '#2a2a2a'); circ(0, -31, 6, '#555'); rect(-2, -22, 4, 22, '#222'); });
  },
] };

ART['vertigoat'] = { g: 'fifties', p: 0, s: [
  () => { // the goat dangles from the gutter, the street spirals below
    rect(0, 0, VW, VH, '#c9b48a');
    for (let i = 12; i > 0; i--) { const r2 = i * 18 + wob(4); c.save(); c.translate(200, 230); c.rotate(i * 0.25 + M * 0.3); rect(-r2, -r2 * 0.8, r2 * 2, r2 * 1.6, i % 2 ? '#7a5a3a' : '#a08060'); c.restore(); }
    rect(0, 0, VW, 60, '#5a4030'); rect(0, 56, VW, 8, '#2a1a10'); for (let x = 0; x < VW; x += 20) poly([x, 0, x + 20, 0, x + 10, -10], '#3a2a1a');
    goat(200 + wob(2), 130, 2.0, '#efe8dc', { legs: [-2.6, -2.8, -0.2, 0.4] });
    txt('!', 260, 80, 30, '#c01818', { font: 'Arial Black' });
  },
  () => { // under the Golden Gate
    sky('#e8b070', '#7aa8c0', 170); sea(170, '#4a7a90', '#1a3a50');
    rect(60, 30, 18, 150, '#c0402a'); rect(300, 50, 16, 130, '#c0402a'); rect(40, 120, 360, 8, '#a0301a');
    c.beginPath(); c.moveTo(-20, 40); c.quadraticCurveTo(190, 160, 69, 30); c.moveTo(69, 30); c.quadraticCurveTo(190, 150, 308, 50); c.moveTo(308, 50); c.quadraticCurveTo(360, 110, 420, 120); c.strokeStyle = '#a0301a'; c.lineWidth = 3; c.stroke();
    for (let x = 75; x < 300; x += 8) line(x, 120, x, 50 + Math.pow((x - 190) / 120, 2) * 60, '#a0301a', 0.8);
    ground(230, '#5a4a3a', '#3a2a1a'); goat(120, 250, 1.3, '#e8e0d0'); person(170, 252, 60, { top: '#555', hat: 'fedora', hatCol: '#444', coat: '#666', facing: -1 });
  },
  () => { // the bell tower stairwell: the dolly-zoom spiral
    rect(0, 0, VW, VH, '#2a2018');
    for (let i = 0; i < 14; i++) { const k = 1 - i / 14; const w = 380 * k + wob(6 * k), hh = 270 * k; c.save(); c.translate(200, 145); c.rotate(i * 0.12); c.strokeStyle = i % 2 ? '#c8a878' : '#8a6a48'; c.lineWidth = 6 * k + 1; c.strokeRect(-w / 2, -hh / 2, w, hh); c.restore(); }
    goat(205, 152, 0.4, '#efe8dc');
  },
  () => { // green neon through the hotel window
    rect(0, 0, VW, VH, '#1a2a20'); glow(320, 80, 260, 'rgba(80,255,140,0.35)');
    windowBox(250, 20, 130, 150, '#0a140e', () => { rect(250, 20, 130, 150, '#103020'); neon('HOTEL', 315, 80, 22, '#6aff9a'); });
    bed(120, 270, 1.6, { base: '#2a1a14', mat: '#a8c8a8', sheet: '#7a9a80' });
    goat(160 + wob(1), 210, 1.5, '#d8f0d8');
    alpha(0.4, () => rect(0, 0, VW, VH, '#40ff90'));
  },
] };

ART['la-dolce-pita'] = { g: 'bw', p: 0, s: [
  () => { // the fountain at night, she wades in holding a gyro
    rect(0, 0, VW, VH, '#151515'); rect(30, 10, 340, 150, '#5a5a5a');
    for (let x = 50; x < 360; x += 50) column(x, 160, 0.55, '#7a7a7a');
    person(200, 120, 60, { sil: '#888', pose: 'armsUp' });
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(80 + i * 30, 150); c.quadraticCurveTo(90 + i * 30, 120, 100 + i * 30 + wob(3), 175); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.stroke(); }
    sea(175, '#3a3a3a', '#1a1a1a', 'rgba(255,255,255,0.45)', 21);
    person(220 + wob(1), 280, 120, { top: '#111', dress: true, skin: '#e8e8e8', hair: '#f4f4f4', hairStyle: 'long', pose: [2.4, -1.4, 0, 0], prop: () => pita(0, 0, 0.5, { rot: -0.4 }) });
    ell(220, 282, 40, 6, 'rgba(255,255,255,0.25)');
  },
  () => { // a helicopter carries a giant pita over the rooftops of Rome
    sky('#bbb', '#eee', 230); clouds(4, 3, 30, 80);
    heli(210 + M * 10, 70, 1.6, '#222'); line(205 + M * 10, 90, 205 + M * 10, 130, '#222', 1.5); pita(205 + M * 10, 158, 1.3, { rot: 0.15 });
    skyline(290, '#555', 23, { minH: 30, maxH: 70, win: '#333', stepped: 0.1, spire: 0.05 }); svg('M 0 0 C 0 -40 60 -40 60 0 Z', '#444', 300, 220, 1.5); rect(342, 192, 6, 18, '#444');
    for (let i = 0; i < 5; i++) person(40 + i * 18, 228, 20, { sil: '#222', pose: 'wave', dress: true });
  },
  () => { // the Vespa on the Via Veneto, flashbulbs
    rect(0, 0, VW, VH, '#1a1a1a'); for (let i = 0; i < 5; i++) { rect(i * 90, 30, 70, 160, '#2a2a2a'); rect(i * 90 + 10, 120, 50, 50, '#e8e8e0'); }
    ground(200, '#3a3a3a', '#111'); vespa(200 + M * 6, 270, 2.0, '#e8e8e8');
    person(190 + M * 6, 230, 60, { top: '#111', bottom: '#111', glasses: '#000', pose: [1.0, 1.0, 1.4, 1.4] });
    person(170 + M * 6, 228, 54, { top: '#eee', dress: true, hairStyle: 'long', hair: '#ddd', pose: [0.8, 0.8, 1.2, 1.2] });
    for (let i = 0; i < 4; i++) { const x = 40 + i * 100; person(x, 290, 70, { sil: '#0a0a0a', hat: 'fedora' }); if ((i + Math.floor(M * 4)) % 3 === 0) { glow(x + 6, 214, 50, 'rgba(255,255,255,0.9)'); } }
  },
] };

ART['rash-o-mon'] = { g: 'bw', p: 0, s: [
  () => { // the great ruined gate in the downpour
    rect(0, 0, VW, VH, '#6a6a6a'); rect(40, 20, 320, 30, '#1a1a1a'); poly([20, 30, 200, -10, 380, 30], '#111');
    rect(60, 50, 26, 220, '#222'); rect(314, 50, 26, 220, '#222'); rect(150, 50, 18, 220, '#2a2a2a'); rect(232, 50, 18, 220, '#2a2a2a');
    ground(240, '#4a4a4a', '#2a2a2a');
    person(180, 262, 56, { sil: '#151515', pose: 'sit' }); person(215, 262, 60, { sil: '#151515', hat: 'kasa' }); person(250, 262, 58, { sil: '#151515', pose: 'hold' });
    rain(17, 260, 'rgba(240,240,240,0.55)', 0.05, 26);
  },
  () => { // the forest, sun through the branches
    rect(0, 0, VW, VH, '#2a2a2a'); for (let i = 0; i < 10; i++) rect(i * 44 + (i * 13) % 20, 0, 8 + (i % 3) * 5, VH, '#111');
    for (let i = 0; i < 40; i++) { const r2 = seeded(i * 7); circ(r2() * VW, r2() * 200, 8 + r2() * 20, `rgba(255,255,255,${0.05 + r2() * 0.18})`); }
    sun(300 + wob(3), 30, 12, '#fff', 'rgba(255,255,255,0.5)'); rays(300, 30, 9, 'rgba(255,255,255,0.08)', 350, 0.03, 1.2);
    person(170 + M * 4, 280, 100, { top: '#888', bottom: '#555', hairStyle: 'bun', pose: 'walk', prop: () => { line(0, 0, 10, -40, '#ccc', 2); } });
  },
  () => { // the rash, under the magnifying glass
    rect(0, 0, VW, VH, '#3a3a3a');
    svg('M -10 120 C 40 60 180 40 420 30 L 420 140 C 200 150 80 170 -10 200 Z', '#c8bdb2');
    const r2 = seeded(31); for (let i = 0; i < 40; i++) circ(80 + r2() * 260, 70 + r2() * 80, 1.5 + r2() * 3, 'rgba(60,30,30,0.6)');
    ring(220 + wob(3), 100, 50, '#111', 9); circ(220 + wob(3), 100, 46, 'rgba(255,255,255,0.15)'); line(255 + wob(3), 136, 300 + wob(3), 200, '#111', 12);
    clipCirc(220 + wob(3), 100, 44, () => { const r3 = seeded(31); for (let i = 0; i < 40; i++) { const x = 80 + r3() * 260, y = 70 + r3() * 80; const rr2 = 1.5 + r3() * 3; circ(220 + (x - 220) * 1.8, 100 + (y - 100) * 1.8, rr2 * 1.8, 'rgba(60,20,20,0.7)'); } });
  },
  () => { // four witnesses kneel in the courtyard, each pointing a different way
    rect(0, 0, VW, 140, '#ddd'); ground(140, '#bbb', '#eee'); for (let i = 0; i < 10; i++) line(0, 150 + i * 14, VW, 150 + i * 14, 'rgba(0,0,0,0.05)', 1);
    const dirs = [2.2, -1.5, 1.4, 3.0];
    for (let i = 0; i < 4; i++) person(70 + i * 85, 262, 115, { top: ['#444', '#ccc', '#666', '#999'][i], bottom: '#222', pose: [dirs[i] + wob(0.05), 0.3, 1.5, 1.4], hat: ['kasa', undefined, 'headband', undefined][i], hairStyle: i === 1 ? 'long' : 'short' });
  },
] };

ART['beanstalker'] = { g: 'zone', p: 1, s: [
  () => { // puddles, debris, beans
    rect(0, 0, VW, VH, '#3a3428'); for (let i = 0; i < 6; i++) ell(60 + i * 60, 80 + (i % 2) * 120, 80, 30, `rgba(${90 + i * 5},${85 + i * 4},70,0.6)`);
    sea(140, '#5a5a48', '#2a2a20', 'rgba(255,255,220,0.15)', 2);
    for (let i = 0; i < 12; i++) { const r2 = seeded(i + 4); ell(r2() * VW, 160 + r2() * 120, 5, 3, '#8a7a4a', r2() * 3); }
    rect(80, 210, 60, 5, '#2a2418'); circ(260, 200, 12, '#4a4030'); rr(300, 240, 40, 16, 3, '#555'); ring(150 + wob(4), 250, 12 + M * 8, 'rgba(255,255,255,0.3)', 1);
    glow(200, 100, 160, 'rgba(255,255,200,0.15)');
  },
  () => { // three men cross the green Zone towards an enormous beanstalk
    sky('#a8a890', '#d8d8c0', 180); hills(180, 10, '#4a5a30', 6);
    for (let i = 0; i < 6; i++) { rect(30 + i * 70, 110 + i * 4, 3, 70, '#2a2a20'); rect(22 + i * 70, 116 + i * 4, 19, 2, '#2a2a20'); } pline([31, 112, 101, 118, 171, 122, 241, 126, 311, 130, 381, 134], '#2a2a20', 0.7);
    c.beginPath(); c.moveTo(330, 190); c.bezierCurveTo(290, 120, 370, 80, 320, -10); c.strokeStyle = '#3a6a2a'; c.lineWidth = 14; c.stroke(); for (let i = 0; i < 6; i++) ell(330 + (i % 2 ? 16 : -16), 160 - i * 30, 12, 6, '#4a8a3a', i % 2 ? 0.5 : -0.5);
    ground(190, '#5a6a3a', '#3a4a22');
    for (let i = 0; i < 3; i++) person(120 + i * 38 + M * 2, 255 + i * 4, 56, { top: ['#4a4a40', '#5a5040', '#3a3a34'][i], bottom: '#2a2a24', hat: i === 1 ? 'cap' : undefined, pose: 'walk', coat: i === 2 });
  },
  () => { // the Room: dunes on the floor, a single bean sprouting
    room('#4a4434', '#8a7a5a', 170); rect(150, 20, 90, 120, '#d8d0b0'); glow(195, 80, 180, 'rgba(255,250,220,0.35)'); lightShafts(150, 20, 90, 120, 3, 'rgba(255,250,220,0.12)', 0.8);
    for (let i = 0; i < 5; i++) svg('M 0 0 C 30 -30 60 -30 100 0 Z', '#b0a078', i * 90 - 20, 230 + (i % 2) * 20, 1);
    ell(200, 240, 6, 4, '#8a7030'); c.beginPath(); c.moveTo(200, 238); c.quadraticCurveTo(195 + wob(2), 220, 204, 206); c.strokeStyle = '#5a9a3a'; c.lineWidth = 2.5; c.stroke(); ell(208, 205, 6, 3, '#6aaa4a', -0.4);
  },
] };

ART['wings-of-dessert'] = { g: 'bw', p: 0, s: [
  () => { // the angel on the Victory Column over Berlin
    sky('#9a9a9a', '#e0e0e0', 290); clouds(10, 5, 140, 260, 'rgba(255,255,255,0.7)', 1.2);
    skyline(290, '#555', 51, { minH: 20, maxH: 60 }); rect(330, 140, 4, 150, '#555'); circ(332, 150, 8, '#555');
    column(160, 300, 1.2, '#aaa'); poly([140, 110, 180, 110, 160, 70], '#c8b070');
    person(195 + wob(1), 102, 66, { top: '#333', coat: '#2a2a2a', hairStyle: 'bun', hair: '#555', wings: 'rgba(240,240,240,0.9)', pose: 'stand', facing: -1 });
  },
  () => { // the library: angels drift among the readers
    room('#8a8a86', '#5a5a58', 200); for (let y = 20; y < 200; y += 40) { rect(0, y, VW, 4, '#3a3a38'); for (let x = 5; x < VW; x += 7) rect(x, y + 6, 5, 30, ['#444', '#666', '#555', '#777'][(x * 3 + y) % 4]); }
    rect(0, 120, VW, 30, '#4a4a48');
    for (let i = 0; i < 4; i++) { table(60 + i * 100, 230, 70, '#2a2a2a'); person(50 + i * 100, 260, 60, { top: '#777', pose: 'sit', hairStyle: i % 2 ? 'long' : 'short' }); }
    person(250 + wob(2), 140 + wob(3), 60, { top: '#222', coat: '#1a1a1a', wings: 'rgba(250,250,250,0.85)', hairStyle: 'bun' });
  },
  () => { // in colour at last: a slice of cake, an angel's hand reaching
    rect(0, 0, VW, VH, '#f2e6d0'); rect(0, 0, VW, 60, '#5a8ab0'); for (let i = 0; i < 9; i++) rect(i * 50, 20, 40, 40, ['#e04040', '#f0c030', '#40a060', '#3070c0'][i % 4]);
    rect(0, 180, VW, 110, '#8a5a3a'); ell(200, 200, 90, 18, '#fff'); cake(200, 196, 2.4);
    svg('M 0 0 C 30 -10 60 -10 90 0 L 96 6 L 90 10 C 60 14 30 14 0 12 Z', '#e8c8a8', 300 - M * 6, 140, 1.4, -1);
    rect(380, 128, 40, 28, '#3a3a3a');
  },
] };

ART['mood-for-noodles'] = { g: 'wkw', p: 0, s: [
  () => { // the alley: she carries the noodle thermos, slowly
    rect(0, 0, VW, VH, '#1a0c08'); rect(60, 0, 280, VH, '#4a2a18'); for (let y = 0; y < VH; y += 16) line(60, y, 340, y, 'rgba(0,0,0,0.2)', 1);
    lamppost(320, 220, 1.6, '#111', 'rgba(255,200,120,0.6)'); glow(200, 260, 180, 'rgba(255,170,80,0.25)');
    person(190 + M * 2, 270, 170, { top: '#1a4a2a', dress: true, long: true, skin: '#f0d0b0', hair: '#0a0505', hairStyle: 'bun', pose: [0.25, -0.15, 0, 0], prop: () => { rr(-6, -2, 12, 18, 3, '#c0b8a8'); rect(-1, -6, 2, 4, '#555'); } });
    rect(0, 0, 60, VH, '#0a0504'); rect(340, 0, 60, VH, '#0a0504');
  },
  () => { // room 2046: smoke, red curtains
    rect(0, 0, VW, VH, '#5a0a0a'); for (let x = 0; x < VW; x += 22) rect(x, 0, 11, VH, 'rgba(0,0,0,0.25)');
    rect(250, 40, 100, 140, '#2a1a10'); txt('2046', 300, 60, 18, '#e8c080', { font: 'Georgia' });
    person(160, 290, 180, { top: '#e8e4dc', bottom: '#1a1a1a', tie: '#3a1a10', coat: '#2a2a2a', hair: '#0a0505', pose: [2.5, -0.1, 0, 0], prop: () => { line(0, -2, 8, -2, '#fff', 1.5); } });
    steam(170, 90, 3, 'rgba(255,255,255,0.25)', 80);
  },
  () => { // the noodle stall at night: steam, red lanterns
    rect(0, 0, VW, VH, '#0a0808'); for (let i = 0; i < 6; i++) { ell(40 + i * 65, 40, 16, 20, '#d01818'); glow(40 + i * 65, 40, 40, 'rgba(255,60,40,0.4)'); rect(36 + i * 65, 18, 8, 4, '#222'); }
    rect(40, 140, 320, 100, '#3a2010'); rect(30, 130, 340, 12, '#5a3018');
    for (let i = 0; i < 3; i++) { ell(100 + i * 100, 140, 30, 8, '#888'); steam(100 + i * 100, 130, 4, 'rgba(255,240,220,0.35)', 80); }
    txt('麵', 200, 200, 40, '#e8c060'); noodleBowl(320, 128, 1.0, '#c82020');
  },
  () => { // two neighbours pass on the narrow staircase
    rect(0, 0, VW, VH, '#2a1a10'); for (let i = 0; i < 12; i++) rect(100 + i * 8, 290 - i * 24, 220, 6, '#5a3a20');
    rect(90, 0, 10, VH, '#1a0c06'); rect(320, 0, 10, VH, '#1a0c06'); glow(210, 40, 120, 'rgba(255,200,120,0.4)');
    person(180 - M * 3, 250, 150, { top: '#5a1a2a', dress: true, long: true, hairStyle: 'bun', hair: '#0a0505', skin: '#f0d0b0', facing: 1 });
    person(250 + M * 3, 210, 150, { top: '#e8e4dc', coat: '#2a2a2a', tie: '#1a1a1a', hair: '#0a0505', facing: -1, prop: () => { rr(-6, -2, 12, 18, 3, '#c0b8a8'); } });
  },
] };

ART['paris-texas-toast'] = { g: 'desert', p: 0, s: [
  () => { // out of the desert in a red cap, holding a slice of garlic bread
    sky('#5a9ad8', '#e8d0a0', 190); svg('M 0 190 L 30 140 L 90 140 L 110 190 Z', '#b0603a'); svg('M 240 190 L 270 120 L 360 120 L 380 190 Z', '#a0502a');
    ground(190, '#d8b07a', '#b08050'); for (let i = 0; i < 10; i++) { const r2 = seeded(i + 1); ell(r2() * VW, 200 + r2() * 90, 6, 3, '#6a7a3a'); }
    person(200 + M * 3, 275, 120, { top: '#5a5a5a', bottom: '#5a5a5a', tie: '#3a3a3a', hat: 'cap', hatCol: '#c01818', hairStyle: 'beard', pose: 'walk', prop: () => { rr(-6, -4, 14, 9, 3, '#e8c070'); circ(-2, 0, 1, '#4a8a2a'); } });
  },
  () => { // neon motel sign at dusk
    sky('#2a2a6a', '#e86a3a', 200); ground(200, '#3a2a2a', '#1a1010');
    rect(60, 140, 260, 60, '#2a1a1a'); for (let i = 0; i < 6; i++) rect(70 + i * 42, 160, 30, 30, i % 2 ? '#e8b060' : '#3a2a2a');
    rect(320, 50, 6, 150, '#222'); rr(280, 40, 90, 70, 8, '#1a1a1a'); neon('MOTEL', 325, 60, 18, '#ff4a6a'); neon('TOAST', 325, 90, 14, '#4af0ff');
    car(140, 250, 1.4, { col: '#3a5a7a' });
  },
  () => { // the peep-show booth: the one-way mirror, a pink sweater, a toaster
    rect(0, 0, VW, VH, '#1a0a0a'); rect(60, 20, 280, 200, '#4a2a2a'); glow(200, 120, 200, 'rgba(255,180,160,0.4)');
    bust(200 + wob(1), 120, 1.2, { skin: '#f0d0b0', hair: '#e8c870', hairStyle: 'long', top: '#e86a9a', look: -2 });
    rr(250, 170, 60, 44, 6, '#c8c8c8'); rect(262, 164, 14, 8, '#e0b060'); rect(284, 164, 14, 8, '#e0b060');
    alpha(0.25, () => bust(180, 180, 1.4, { top: '#333', hat: undefined, hair: '#222' }));
    rect(0, 220, VW, 70, '#2a1414');
  },
] };
// ===== blockbusters =====
ART['paws'] = { g: 'seventies', p: 2, s: [
  () => { // a lone swimmer at dusk, and a dog's ear cutting through the water like a fin
    sky('#e8804a', '#f8d090', 140); sun(300, 130, 26, '#fff0b0'); sea(140, '#2a5a7a', '#0a1a2a', 'rgba(255,200,140,0.35)', 8);
    const fx = 240 - M * 8; svg('M 0 0 C 4 -30 14 -54 34 -62 C 40 -50 44 -24 46 0 Z', '#5a3a20', fx, 206, 1); svg('M 8 -6 C 12 -28 20 -44 32 -52 C 36 -40 38 -20 38 -6 Z', '#7a5030', fx, 206, 1); ell(fx + 15, 206, 30, 4, 'rgba(255,255,255,0.4)');
    circ(110, 208, 6, '#e0b090'); line(98, 210, 92, 206, '#e0b090', 3); line(122, 210, 128, 205, '#e0b090', 3); ell(110, 212, 18, 3, 'rgba(255,255,255,0.4)');
  },
  () => { // the crowded beach, the police chief stares out to sea
    sky('#7ac0e8', '#d0eaf8', 120); sea(120, '#3a8ab0', '#2a7a9a'); ground(165, '#f0d8a0', '#e0c080');
    for (let i = 0; i < 6; i++) { const x = 30 + i * 70; poly([x - 22, 190 + (i % 2) * 20, x, 175 + (i % 2) * 20, x + 22, 190 + (i % 2) * 20], ['#e04040', '#f0f0f0', '#3070d0', '#f0c030', '#e04040', '#40b060'][i]); line(x, 175 + (i % 2) * 20, x, 225 + (i % 2) * 20, '#666', 1.5); }
    for (let i = 0; i < 10; i++) person(20 + i * 40, 240 + (i % 3) * 10, 34, { top: ['#e04040', '#3070d0', '#f0c030', '#fff'][i % 4], bottom: '#e0b090', pose: i % 2 ? 'walk' : 'stand' });
    bust(320, 230, 1.2, { top: '#a89060', hair: '#3a2a1a', glasses: '#222', look: -4, collar: '#c8b080' });
  },
  () => { // the boat, and the dog that is bigger than the boat
    sky('#a8c8d8', '#e8e0c8', 170); sea(170, '#3a6a80', '#1a3a4a', 'rgba(255,255,255,0.3)', 12);
    at(110, 190, 3.6, 1, () => { ell(0, 0, 30, 18, '#8a5a30'); ell(18, 4, 16, 10, '#8a5a30'); circ(32, 0, 3, '#111'); ell(-6, -14, 7, 12, '#5a3a20', -0.4); circ(8, -6, 2, '#111'); ell(26, 14, 5, 7 + wob(1), '#e06070'); });
    ell(110, 200, 120, 12, 'rgba(255,255,255,0.3)');
    boat(280 + wob(2), 210, 1.6, { name: 'ORCA', hull: '#e8e0d0' });
  },
  () => { // underwater: the swimmer's legs above, something brown and furry below
    rect(0, 0, VW, VH, '#0a3a4a'); c.fillStyle = lg(0, 0, 0, VH, ['#4aa0b8', '#0a2a3a', '#041018']); c.fillRect(0, 0, VW, VH);
    rays(200, -60, 7, 'rgba(200,255,255,0.08)', 380, 0.05, 1.3);
    line(190, 0, 186 + wob(4, 2), 60, '#e0b090', 8); line(210, 0, 214 - wob(4, 2), 58, '#e0b090', 8);
    svg('M -60 0 C -50 -26 30 -30 60 -12 C 72 -6 72 6 60 10 C 30 20 -40 18 -60 0 Z', '#3a2a18', 180 + M * 6, 220, 1.4);
    circ(258 + M * 6, 208, 3, '#d8d8a0'); poly([260 + M * 8, 232, 268 + M * 8, 250, 250 + M * 8, 236], '#2a1a10');
    for (let i = 0; i < 8; i++) circ(100 + i * 30, 60 + (i * 37) % 120 - M * 10, 2, 'rgba(255,255,255,0.4)');
  },
] };

ART['the-codfather'] = { g: 'amber', p: 0, s: [
  () => { // the Don: a cod in a tuxedo behind the desk, rose in the lapel
    rect(0, 0, VW, VH, '#120a04'); blinds(250, 30, 120, 150, 'rgba(0,0,0,0.6)', 9); alpha(0.6, () => rect(250, 30, 120, 150, '#8a5a20'));
    cone(310, 0, Math.PI * 0.62, 0.25, 320, 'rgba(255,180,90,0.25)');
    fish(190 + wob(1), 150, 3.0, '#8a8a7a', { tux: true, rose: true, facing: 1 });
    desk(200, 200, 300, '#2a1408'); rect(280, 186, 30, 14, '#3a2a1a'); cup(110, 200, 0.7, '#c8b8a0', { saucer: false });
    cat(330, 202, 0.7, '#e8e0d0', { eyeCol: '#7a9a50' });
  },
  () => { // the producer wakes up with a cod head in his bed
    rect(0, 0, VW, VH, '#2a1a10'); rect(0, 0, VW, 140, '#4a2a18'); glow(120, 60, 120, 'rgba(255,200,120,0.3)');
    bed(220, 260, 2.6, { base: '#3a1a0a', mat: '#e8dccc', sheet: '#c8b8a0' });
    at(240, 168, 1.2, 1, () => { ell(0, 0, 26, 16, '#8a8a7a'); poly([-24, 0, -40, -12, -40, 12], '#7a7a6a'); circ(14, -4, 4, '#fff'); circ(15, -4, 2, '#111'); line(20, 6, 26, 6, '#333', 2); });
    alpha(0.6, () => svg('M 0 0 C 30 6 60 14 80 30 L 0 30 Z', '#7a0a0a', 210, 175, 1));
    bust(110, 200, 0.9, { top: '#e8e0d0', hair: '#555', mouth: 'o', wide: true, brow: 14 });
  },
  () => { // the wedding: lights strung over the garden, everyone dancing
    sky('#6a8a50', '#c8c890', 180); for (let i = 0; i < 3; i++) pline([0, 40 + i * 30, 100, 60 + i * 30, 200, 45 + i * 30, 300, 62 + i * 30, 400, 40 + i * 30], '#333', 1);
    for (let i = 0; i < 30; i++) { const x = i * 14, y = 50 + Math.sin(i * 0.8) * 10 + (i % 3) * 30; circ(x, y, 2.4, '#fff8c0'); glow(x, y, 8, 'rgba(255,240,180,0.6)'); }
    ground(180, '#7a8a50', '#4a5a30'); rect(40, 190, 320, 10, '#f4f0e0');
    for (let i = 0; i < 8; i++) person(40 + i * 45 + wob(2, 1, i * 0.2), 270 + (i % 2) * 10, 70, { top: i % 2 ? '#f0e8e0' : '#1a1a1a', dress: i % 2 === 1, bottom: '#1a1a1a', pose: 'dance', facing: i % 2 ? -1 : 1, hairStyle: i % 2 ? 'bun' : 'short' });
  },
  () => { // dinner at the restaurant: red check tablecloth, the offer
    rect(0, 0, VW, VH, '#1a0c06'); glow(200, 80, 200, 'rgba(255,170,80,0.3)'); rect(196, 0, 8, 60, '#111'); ell(200, 62, 24, 10, '#3a2a10');
    c.save(); c.beginPath(); c.rect(40, 190, 320, 100); c.clip(); for (let x = 40; x < 360; x += 20) for (let y = 190; y < 290; y += 20) if (((x - 40) / 20 + (y - 190) / 20) % 2 === 0) rect(x, y, 20, 20, '#a01010'); else rect(x, y, 20, 20, '#f0e8e0'); c.restore();
    fish(110, 160, 1.7, '#8a8a7a', { tux: true }); fish(300, 160, 1.7, '#7a7a6a', { tux: true, facing: -1 });
    ell(200, 205, 30, 8, '#fff'); for (let i = 0; i < 3; i++) rr(186 + i * 10, 194, 9, 12, 4, '#e8c890'); rect(234, 165, 6, 30, '#2a5a2a'); rect(232, 160, 10, 6, '#2a5a2a');
  },
] };

ART['jurassic-pork'] = { g: 'techni', p: 1, s: [
  () => { // the gates, torches, jungle
    sky('#7aa0b0', '#c8d8c0', 180); for (let i = 0; i < 9; i++) palm(i * 50, 200, 1.4, '#2a4a2a', (i % 2 ? 0.3 : -0.3));
    ground(200, '#4a5a2a', '#2a3a1a'); rect(70, 40, 30, 200, '#5a4a3a'); rect(300, 40, 30, 200, '#5a4a3a'); rect(60, 30, 280, 40, '#4a3a2a');
    txt('JURASSIC PORK', 200, 52, 22, '#e8c040', { font: '"Arial Black", Impact', stroke: '#3a1a0a', lw: 4 });
    for (const x of [85, 315]) { rect(x - 2, 80, 4, 20, '#222'); poly([x - 6, 80, x, 60 - wob(4, 3), x + 6, 80], '#ffa030'); glow(x, 70, 30, 'rgba(255,170,60,0.6)'); }
    car(200, 270, 1.6, { style: 'jeep', col: '#c8a030', logo: '#c01818' });
  },
  () => { // the T. rex with a pig's snout roars over the jeep
    sky('#3a4a5a', '#7a8a8a', 200); rain(3, 120, 'rgba(220,230,255,0.4)'); for (let i = 0; i < 6; i++) palm(i * 80, 210, 1.3, '#1a2a1a');
    ground(210, '#3a4a2a', '#1a2a10'); for (let x = 0; x < VW; x += 26) rect(x, 150, 3, 70, '#555'); for (let i = 0; i < 4; i++) line(0, 160 + i * 14, VW, 160 + i * 14, '#555', 1);
    trex(180, 250, 1.8 + wob(0.02), '#5a6a4a', { roar: true, snout: '#e8a0a8', facing: 1 });
    car(310, 280, 1.3, { style: 'jeep', col: '#c8a030', lights: 'rgba(255,255,220,0.5)', facing: -1 });
  },
  () => { // the glass of water on the dashboard ripples. Next to a ham sandwich.
    rect(0, 0, VW, VH, '#1a2018'); rect(0, 0, VW, 150, '#4a5a4a'); rect(0, 140, VW, 20, '#111');
    rect(0, 160, VW, 130, '#3a3a34'); rr(60, 150, 280, 30, 8, '#2a2a26'); circ(320, 210, 24, '#222');
    c.fillStyle = 'rgba(220,240,255,0.35)'; c.fillRect(170, 150, 50, 70); ell(195, 152, 25, 5, 'rgba(255,255,255,0.4)');
    for (let i = 0; i < 3; i++) ring(195, 152, (i + 1) * 6 + M * 4, 'rgba(255,255,255,0.6)', 1);
    at(100, 205, 1.2, 1, () => { poly([-30, 0, 30, 0, 26, -10, -26, -10], '#d8b070'); rect(-30, -14, 60, 4, '#e88a8a'); rect(-30, -17, 60, 3, '#6a9a3a'); poly([-30, -17, 30, -17, 26, -26, -26, -26], '#d8b070'); });
  },
  () => { // sunrise over the plain: long-necked dinosaurs, very pink
    sky('#f0a060', '#f8e0a0', 200); sun(320, 180, 30); mountains(200, 50, '#8a6a5a', 5, 6);
    ground(200, '#8a9a4a', '#5a6a2a'); bronto(140, 250, 1.4, '#e098a0'); bronto(270, 228, 0.8, '#d08890'); bronto(340, 220, 0.5, '#c88088');
    person(40, 285, 70, { top: '#e0d0a0', bottom: '#8a7a5a', hat: 'cowboy', hatCol: '#8a6a3a', pose: 'point', facing: 1 });
  },
] };

ART['tightanic'] = { g: 'techni', p: 1, s: [
  () => { // the liner at sunset, steaming for New York
    sky('#2a3a6a', '#f8a060', 170); sun(80, 165, 22, '#fff0a0'); sea(170, '#3a4a6a', '#0a1020', 'rgba(255,180,120,0.3)', 5);
    liner(230 + M * 4, 175, 1.15, { lights: '#ffe8a0' }); for (let i = 0; i < 3; i++) ell(300 + i * 20, 120 - i * 14, 10 + i * 4, 6, 'rgba(80,80,80,0.5)');
  },
  () => { // flying at the bow at sunset, arms out
    sky('#e86a3a', '#f8d070', 230); sun(200, 220, 30, '#fff6c0'); sea(220, '#c86a4a', '#3a2a3a', 'rgba(255,230,160,0.4)', 7);
    poly([0, 290, 140, 220, 400, 210, 400, 290], '#2a1a1a'); line(140, 220, 400, 180, '#1a0a0a', 3); for (let x = 160; x < 400; x += 22) line(x, 218 - (x - 140) * 0.15, x, 200 - (x - 140) * 0.15, '#1a0a0a', 2);
    person(250, 205, 100, { top: '#1a1a1a', bottom: '#1a1a1a', pose: 'out', hair: '#a07020' });
    person(232, 210, 100, { top: '#d8a8a0', dress: true, long: true, pose: 'out', hair: '#c04a1a', hairStyle: 'long', skin: '#f8d8c0' });
  },
  () => { // the iceberg at night
    sky('#020410', '#101a30', 180); stars(120, 7, 180); moon(70, 50, 10);
    sea(180, '#0a1428', '#000208', 'rgba(200,220,255,0.25)', 13);
    svg('M 0 0 L 30 -80 L 50 -60 L 70 -110 L 95 -70 L 120 -90 L 150 0 Z', '#c8d8e8', 40, 190, 1); svg('M 70 -110 L 95 -70 L 120 -90 L 150 0 L 90 0 Z', '#8a9ab0', 40, 190, 1);
    liner(310 - M * 4, 200, 0.8, { lights: '#ffe8a0', facing: -1 });
    txt('ICEBERG, RIGHT AHEAD!', 230, 40, 12, '#fff', { font: 'Arial Black', shadow: '#000' });
  },
  () => { // going down: the stern points at the stars. Duct tape did not hold.
    sky('#000', '#0a1428', 200); stars(160, 9, 200);
    sea(200, '#0a1428', '#000', 'rgba(200,220,255,0.2)', 2);
    liner(200, 195, 1.0, { rot: -1.05, lights: '#ffe8a0', tape: '#a8a8a8' });
    for (let i = 0; i < 4; i++) boat(40 + i * 100 + wob(2, 1, i), 250 + (i % 2) * 10, 0.6, { hull: '#d8d0c0', cabin: '#d8d0c0' });
  },
] };

ART['e-tea'] = { g: 'warm', p: 0, s: [
  () => { // the bicycle crosses the moon; the alien in the basket holds a teacup
    sky('#05081a', '#1a2a50'); stars(80, 3); moon(220, 120, 95, '#f8f0d8');
    for (let i = 0; i < 7; i++) pine(i * 60 + 10, 290, 1.2 + (i % 2) * 0.4, '#05080a');
    at(210 + M * 6, 150 - M * 2, 1, 1, () => { bike(0, 0, 1.8, '#05080a', { basket: '#05080a' }); person(-6, -30, 50, { sil: '#05080a', pose: [1.1, 1.0, 0.6, -0.3], hat: undefined }); alienET(26, -70, 0.55, { col: '#05080a' }); cup(36, -82, 0.35, '#05080a', { saucer: false }); });
  },
  () => { // the glowing finger touches the teacup in the closet full of toys
    rect(0, 0, VW, VH, '#2a1810'); glow(200, 150, 200, 'rgba(255,170,90,0.35)');
    for (let i = 0; i < 6; i++) rect(i * 70, 30 + (i % 2) * 10, 50, 50, ['#c04030', '#3060a0', '#e0b030', '#40a060', '#a050a0', '#d07030'][i]);
    alienET(160, 280, 2.2, { reach: 1.5 + wob(0.05), glow: true });
    cup(290, 230, 1.6, '#f4f0e8', { tea: '#a05a20', steam: true });
  },
  () => { // the forest at night, the spaceship lights through the fog
    sky('#0a1020', '#1a2a3a'); glow(200, 120, 220, 'rgba(200,220,255,0.35)');
    ell(200, 120, 90, 30, '#3a3a40'); for (let i = 0; i < 9; i++) circ(124 + i * 19, 126, 4, ['#ff6060', '#60ff60', '#6060ff'][i % 3]);
    rays(200, 120, 12, 'rgba(255,255,255,0.05)', 300, 0.04);
    for (let i = 0; i < 10; i++) pine(i * 44, 290, 1.6 + (i % 3) * 0.3, '#05080a');
    fog(180, 290, 'rgba(180,200,230,0.45)');
  },
  () => { // in the kitchen in a blanket, at last, a proper cup of tea
    room('#e8d0a0', '#a07040', 190, { stripes: ['rgba(255,255,255,0.15)', 24] }); windowBox(260, 30, 110, 90, '#fff', () => { sky('#3a5a9a', '#9ab0d0'); });
    table(180, 210, 220, '#8a5a30'); alienET(160, 210, 1.2, { reach: 0.8 });
    svg('M -26 0 C -30 -40 30 -40 26 0 Z', '#d05a8a', 166, 190, 1);
    cup(205, 210, 0.9, '#fff', { tea: '#a05a20', steam: true }); at(250, 210, 1, 1, () => { ell(0, -10, 18, 14, '#3060a0'); rect(-4, -26, 8, 4, '#3060a0'); line(16, -14, 26, -22, '#3060a0', 3); });
  },
] };

ART['back-to-the-suture'] = { g: 'eighties', p: 0, s: [
  () => { // the time car leaves twin fire trails down the highway
    sky('#0a0a2a', '#4a1a5a', 170); stars(40, 5, 120); mountains(170, 30, '#1a0a2a', 9, 5);
    ground(170, '#1a1a1a', '#000'); poly([180, 170, 220, 170, 400, 290, 0, 290], '#222'); for (let i = 0; i < 6; i++) rect(198, 175 + i * 22, 4, 10 + i * 2, '#e8e070');
    pline([200, 170, 170, 220, 100, 290], '#ff6020', 6); pline([210, 170, 230, 220, 300, 290], '#ff6020', 6); glow(200, 172, 40, 'rgba(255,255,255,0.8)');
    car(200, 180 + wob(1), 0.8, { style: 'delorean', lights: 'rgba(120,200,255,0.6)' });
  },
  () => { // the clock tower in the lightning storm, a man hangs from the hands
    sky('#05050f', '#202040'); pline([300, 0, 280, 60, 300, 70, 260, 160], '#e8f0ff', 3); glow(270, 100, 120, 'rgba(200,220,255,0.3)');
    rect(110, 70, 140, 220, '#3a3020'); poly([100, 70, 180, 20, 260, 70], '#2a2018'); clock(180, 120, 34, { face: '#e8e0b0', h: 10, m: 4 });
    person(196, 128, 26, { top: '#555', pose: 'armsUp' });
    rain(9, 140);
  },
  () => { // the operating theatre: the surgeon checks his own stitches
    rect(0, 0, VW, VH, '#1a3a3a'); ell(200, 30, 80, 24, '#d8e0e0'); cone(200, 30, Math.PI / 2, 0.45, 270, 'rgba(255,255,255,0.3)');
    rect(60, 200, 280, 20, '#9ab0b0'); rect(70, 220, 10, 70, '#555'); rect(320, 220, 10, 70, '#555');
    person(200, 290, 140, { top: '#3a8a6a', bottom: '#3a8a6a', hat: 'cap', hatCol: '#3a8a6a', pose: 'hold', eyes: true, glasses: 'rgba(200,240,255,0.7)' });
    pline([150, 192, 156, 186, 162, 192, 168, 186, 174, 192, 180, 186], '#1a1a1a', 2); for (let i = 0; i < 6; i++) line(150 + i * 6, 184, 150 + i * 6, 194, '#1a1a1a', 1);
  },
  () => { // the flux capacitor (sutures not included)
    rect(0, 0, VW, VH, '#2a2a2a'); rr(100, 30, 200, 230, 10, '#5a5a5a'); rr(110, 40, 180, 210, 6, '#151515');
    const k = 0.6 + 0.4 * Math.sin(M * TAU * 3);
    [[200, 150, 150, 70], [200, 150, 250, 70], [200, 150, 200, 230]].forEach(([x1, y1, x2, y2]) => { line(x1, y1, x2, y2, '#888', 16); line(x1, y1, x2, y2, `rgba(255,240,180,${k})`, 7); });
    glow(200, 150, 90, `rgba(255,255,200,${0.5 * k})`); txt('FLUX SUTURATOR', 200, 270, 12, '#eee', { font: 'Arial Black' });
  },
] };

ART['the-mattress'] = { g: 'matrix', p: 1, s: [
  () => { // falling green code
    rect(0, 0, VW, VH, '#000'); const r2 = seeded(66);
    for (let col = 0; col < 34; col++) { const x = col * 12 + 4, len = 6 + Math.floor(r2() * 18), y0 = r2() * VH + M * 30;
      for (let k = 0; k < len; k++) { const y = (y0 - k * 12) % (VH + 40); const ch = String.fromCharCode(0x30A2 + Math.floor(h2(col, k, 3) * 40)); txt(ch, x, y, 11, k === 0 ? '#e8ffe8' : `rgba(60,255,90,${1 - k / len})`, { font: 'monospace' }); } }
  },
  () => { // the rooftop: leaning back, dodging bullets
    sky('#9aaa8a', '#e0e8d0', 200); skyline(220, '#5a6a5a', 3, { minH: 60, maxH: 160, win: '#c8d8b8' }); ground(220, '#4a4a44', '#2a2a28');
    person(200, 270, 130, { top: '#0a0a0a', coat: '#0a0a0a', bottom: '#0a0a0a', glasses: '#000', pose: [-0.8, -2.2, 0.9, 0.3], rot: -0.65 });
    for (let i = 0; i < 4; i++) { const y = 120 + i * 18; pline([0, y, 120 + i * 30 + M * 10, y + 4], 'rgba(220,255,220,0.5)', 1); ell(128 + i * 30 + M * 10, y + 4, 4, 2, '#d8c070'); for (let k = 1; k < 6; k++) ring(120 + i * 30 + M * 10 - k * 18, y + 4, 3 + k, 'rgba(220,255,220,0.25)', 0.8); }
  },
  () => { // the mattress showroom: red pill or blue pill
    room('#2a3a2a', '#1a2a1a', 160, { tiles: 'rgba(120,255,120,0.15)' });
    for (let i = 0; i < 4; i++) bed(40 + i * 110, 170 + (i % 2) * 6, 0.7, { mat: '#d8e8d8', base: '#1a1a1a' });
    svg('M 0 0 C 30 -16 120 -16 160 0 C 170 20 120 50 60 50 C 20 50 -10 30 0 0 Z', '#d8b898', 120, 200, 1.1);
    rr(150 + wob(1), 205, 22, 10, 5, '#d01818'); rr(225 - wob(1), 205, 22, 10, 5, '#1838d0');
    txt('FIRM', 161, 190, 10, '#fff', { font: 'Arial Black' }); txt('SOFT', 236, 190, 10, '#fff', { font: 'Arial Black' });
  },
  () => { // the lobby: pillars, falling shell casings
    room('#3a4a3a', '#2a2a24', 200, { tiles: 'rgba(0,0,0,0.2)' });
    for (let i = 0; i < 5; i++) { const x = 30 + i * 85; rect(x, 0, 30, 200, '#5a6a5a'); rect(x - 4, 190, 38, 10, '#4a5a4a'); for (let k = 0; k < 3; k++) circ(x + 8 + k * 7, 60 + k * 40, 3, '#222'); }
    person(150, 270, 100, { top: '#0a0a0a', coat: '#0a0a0a', bottom: '#0a0a0a', glasses: '#000', pose: 'fight' });
    for (let i = 0; i < 12; i++) { const r2 = seeded(i + 40); rr(120 + r2() * 160, 150 + r2() * 120 + M * 10, 4, 7, 1, '#d8b040'); }
  },
] };

ART['toastbusters'] = { g: 'eighties', p: 1, s: [
  () => { // four jumpsuits, four proton streams, one haunted slice of toast
    rect(0, 0, VW, VH, '#1a1a2a'); room('#3a2a3a', '#1a1a1a', 210);
    const tx = 260 + wob(4), ty = 90 + wob(3, 1, 0.3); glow(tx, ty, 70, 'rgba(160,255,160,0.5)'); toast(tx, ty, 1.8, { face: 'o', col: '#c8f0a0', crust: '#7ab060' });
    for (let i = 0; i < 4; i++) { const x = 60 + i * 50; pline([x + 8, 205, (x + tx) / 2, ty + 60 - wob(10, 3, i * 0.2), tx, ty], '#ff70ff', 2); pline([x + 8, 205, (x + tx) / 2 + 10, ty + 40 + wob(10, 3), tx, ty], '#80f0ff', 1); }
    for (let i = 0; i < 4; i++) person(60 + i * 50, 285, 90, { top: '#b8a888', bottom: '#b8a888', pose: 'point', hairStyle: i === 2 ? 'curly' : 'short', prop: () => { rect(-2, -2, 18, 4, '#333'); } });
  },
  () => { // the giant toast man strolls between the skyscrapers
    sky('#1a1a3a', '#7a4a6a', 290); skyline(290, '#1a1a2a', 81, { minH: 90, maxH: 220, win: '#ffe080', lit: 0.4 });
    at(200, 290 + wob(2), 1, 1, () => { rr(-70, -260, 140, 190, 30, '#a0682a'); rr(-60, -250, 120, 170, 24, '#e0b060'); circ(-22, -190, 9, '#222'); circ(22, -190, 9, '#222'); c.beginPath(); c.arc(0, -165, 24, 0.2, Math.PI - 0.2); c.strokeStyle = '#4a2010'; c.lineWidth = 4; c.stroke(); rect(-50, -80, 30, 80, '#e0b060'); rect(20, -80, 30, 80, '#e0b060'); rr(-14, -240, 28, 18, 5, '#f8e88a'); });
    skyline(290, '#0a0a14', 33, { minH: 30, maxH: 90, win: '#ffd060', lit: 0.5 });
  },
  () => { // the firehouse, the car, the logo
    rect(0, 0, VW, VH, '#6a3a2a'); for (let y = 0; y < VH; y += 10) for (let x = (y / 10 % 2) * 12; x < VW; x += 24) rect(x, y, 22, 8, '#7a4430');
    rect(80, 110, 240, 180, '#1a1a1a'); circ(200, 60, 36, '#f4f4f4'); ring(200, 60, 36, '#d01818', 7);
    at(200, 72, 0.9, 1, () => toast(0, 0, 1, { face: true })); line(175, 35, 225, 85, '#d01818', 7);
    car(200, 280, 2.1, { style: 'ambulance', col: '#f4f4f4' });
  },
  () => { // the library ghost: a slice floats among the stacks
    room('#3a2a20', '#2a1a10', 220); for (let k = 0; k < 4; k++) { const x = k * 105; rect(x, 0, 90, 220, '#2a1a10'); for (let y = 10; y < 220; y += 30) { rect(x, y, 90, 4, '#1a0a04'); for (let b = 0; b < 12; b++) rect(x + 3 + b * 7, y + 6, 5, 22, ['#5a2a2a', '#2a4a2a', '#2a2a5a', '#6a5a2a'][(b + k + y) % 4]); } }
    glow(200, 120, 90, 'rgba(160,255,200,0.45)'); toast(200 + wob(4), 120 + wob(3), 1.6, { face: 'o', col: 'rgba(210,255,220,0.85)', crust: 'rgba(150,230,180,0.85)' });
    for (let i = 0; i < 6; i++) { c.save(); c.translate(80 + i * 50, 240 + (i % 2) * 20 - M * 6); c.rotate(i); rect(-8, -5, 16, 10, '#e8e0d0'); c.restore(); }
  },
] };

ART['star-wares'] = { g: 'techni', p: 2, s: [
  () => { // the crawl
    rect(0, 0, VW, VH, '#000'); stars(160, 1);
    c.save(); c.translate(200, 300); c.transform(1, 0, 0, 0.5, 0, 0);
    const lines = ['Episode IV', 'A NEW HOPE', '', 'A long time ago, in', 'a shopping mall far,', 'far away, the evil', 'GALACTIC FOOD COURT', 'has raised its prices', 'again...'];
    lines.forEach((l, i) => { const y = -40 - (lines.length - 1 - i) * 40 - M * 10, sc = 1 + y / 900; if (sc > 0.1) txt(l, 0, y, 28 * sc + 1, '#ffd040', { font: '"Franklin Gothic Medium", "Arial Narrow", Arial', weight: 'bold' }); });
    c.restore();
  },
  () => { // twin suns over the desert farm
    sky('#4a3a6a', '#f8b060', 190); sun(160, 170, 16, '#fff0c0'); sun(220, 182, 10, '#ffd0a0');
    ground(190, '#c89a60', '#8a6a3a'); for (let i = 0; i < 3; i++) svg('M 0 0 C 20 -10 50 -10 70 0 Z', '#a87a48', 40 + i * 120, 195, 1);
    svg('M 0 0 C 0 -20 40 -20 40 0 Z', '#d8b880', 290, 200, 1.4); rect(310, 160, 3, 22, '#555');
    person(170, 240, 70, { top: '#e8e0d0', bottom: '#d8d0c0', hairStyle: 'short', hair: '#c89a50', facing: -1 });
  },
  () => { // space battle over the mall
    rect(0, 0, VW, VH, '#000'); stars(200, 2); circ(330, 220, 90, '#6a6a7a'); ring(330, 220, 50, '#4a4a5a', 3); rect(250, 215, 160, 4, '#4a4a5a');
    poly([20, 40, 260, 80, 20, 120], '#a8a8b0'); poly([20, 80, 260, 80, 20, 120], '#7a7a88'); rect(100, 60, 30, 10, '#8a8a98');
    for (let i = 0; i < 3; i++) { const x = 230 + i * 50 - M * 10, y = 160 + i * 20; poly([x - 16, y, x + 16, y - 2, x + 20, y, x + 16, y + 2], '#ddd'); line(x - 10, y - 10, x + 4, y + 10, '#ddd', 2); line(x - 10, y + 10, x + 4, y - 10, '#ddd', 2); }
    for (let i = 0; i < 6; i++) { const r2 = seeded(i + 11); line(r2() * 400, r2() * 290, r2() * 400 + 30, r2() * 290 + 6, i % 2 ? '#ff3030' : '#30ff60', 2); }
    sign(300, 20, 90, 18, '#ffd040', 'FOOD COURT', '#111', { size: 9 });
  },
  () => { // laser-sword duel on the escalator
    rect(0, 0, VW, VH, '#1a1a2a'); for (let i = 0; i < 3; i++) { rect(i * 140, 20, 120, 80, '#2a2a3a'); sign(i * 140 + 10, 30, 100, 18, ['#e8e8e8', '#e04040', '#40a0e0'][i], ['SHOES', 'SALE', 'PRETZELS'][i], '#111', { size: 10 }); }
    poly([60, 290, 160, 290, 360, 110, 300, 110], '#4a4a5a'); for (let i = 0; i < 12; i++) line(80 + i * 18, 270 - i * 15, 150 + i * 18, 270 - i * 15, '#2a2a3a', 2);
    person(170, 235, 80, { top: '#e8e0d0', bottom: '#d8d0c0', pose: 'fight', prop: () => { line(0, 0, 30, -30, '#80d0ff', 5); line(0, 0, 30, -30, '#fff', 2); } });
    person(250, 180, 90, { sil: '#0a0a0a', cape: '#0a0a0a', hat: 'helmet', pose: 'fight', facing: -1, prop: () => { line(0, 0, 30, -30, '#ff3030', 5); line(0, 0, 30, -30, '#fff', 2); } });
    glow(208, 140, 40, 'rgba(255,255,255,0.4)');
  },
] };

ART['the-lyin-king'] = { g: 'savanna', p: 0, s: [
  () => { // the rock at sunrise: the cub held up to the sky
    sky('#f86a2a', '#f8d070', 230); sun(200, 230, 60, '#fff0a0'); rays(200, 230, 14, 'rgba(255,255,200,0.12)', 400, 0.05, M * 0.1);
    ground(240, '#5a2a10'); svg('M 0 0 L 60 -20 L 160 -40 L 200 -36 L 190 -20 L 130 0 Z', '#2a1408', 120, 240, 1.3);
    person(280, 190, 50, { sil: '#2a1408', pose: 'armsUp', prop: () => { lion(-10, -2, 0.18, { cub: true, col: '#2a1408', headOnly: true }); } });
    for (let i = 0; i < 8; i++) { const r2 = seeded(i + 2); ell(r2() * 400, 260 + r2() * 30, 8, 4, '#2a1408'); }
  },
  () => { // the stampede down the gorge
    sky('#e8a060', '#f8d8a0', 120); svg('M 0 0 L 0 290 L 120 290 L 80 120 L 60 0 Z', '#7a3a1a'); svg('M 400 0 L 400 290 L 280 290 L 320 110 L 350 0 Z', '#6a3014');
    ground(150, '#c88a50', '#8a5a30'); haze('#e8b070', 0.25);
    for (let r2 = 0; r2 < 4; r2++) for (let i = 0; i < 7; i++) { const x = 70 + i * 40 + (r2 % 2) * 20 + M * 8, y = 150 + r2 * 38; horse(x, y, 0.4 + r2 * 0.18, '#2a1a10'); }
    haze('#f0c080', 0.2);
  },
  () => { // the father's face in the clouds
    sky('#1a1a4a', '#5a5a9a', 230); clouds(51, 6, 30, 200, 'rgba(200,200,240,0.5)', 1.5);
    alpha(0.35 + wob(0.05), () => lion(160, 230, 5, { col: '#e8e8ff', mane: '#c8c8f0', headOnly: true }));
    ground(240, '#1a1420'); svg('M 0 0 L 40 -20 L 90 -16 L 110 0 Z', '#0a0810', 220, 240, 1); lion(270, 220, 0.9, { col: '#2a1a14', mane: '#1a0a08' });
  },
  () => { // a warthog and a meerkat walk the log at sunset
    sky('#f8a040', '#f8e0a0', 200); sun(200, 200, 40, '#fff8c0'); ground(200, '#3a2010');
    line(0, 210, 400, 190, '#1a0a04', 12);
    pig(170 + M * 4, 194, 1.3, '#1a0a04'); lion(90 + M * 4, 202, 0.7, { cub: true, col: '#1a0a04', mane: '#1a0a04' });
    at(240 + M * 4, 192, 1, 1, () => { ell(0, -14, 5, 12, '#1a0a04'); circ(1, -30, 5, '#1a0a04'); line(-3, -4, -12, 2, '#1a0a04', 2); });
    for (let i = 0; i < 4; i++) palm(20 + i * 120, 220, 0.8, '#1a0a04', 0.3);
  },
] };

ART['top-bun'] = { g: 'teal', p: 0, s: [
  () => { // two jets break the sunset. One is shaped like a sesame bun.
    sky('#f0904a', '#ffe0a0', 230); sun(80, 210, 30); haze('#ff9050', 0.15);
    jet(260 + M * 10, 110, 1.6, { col: '#5a6a7a', flame: true });
    at(150 + M * 10, 170, 1.2, 1, () => { ell(0, 0, 40, 16, '#d89a40'); for (let i = 0; i < 9; i++) ell(-28 + i * 7, -6 + (i % 2) * 4, 1.6, 0.8, '#fff8e0'); poly([-10, 0, -30, -28, -20, -28, 6, 0], '#5a6a7a'); poly([-36, 0, -56 - wob(4, 3), 2, -36, 4], '#ff9a30'); });
    sea(230, '#2a5a6a', '#0a2a3a', 'rgba(255,200,140,0.3)');
  },
  () => { // the carrier deck at dusk: crew in coloured vests
    sky('#e86a3a', '#f8c070', 160); sea(160, '#2a4a5a', '#0a1a2a');
    poly([0, 290, 0, 200, 400, 180, 400, 290], '#3a3a40'); line(0, 250, 400, 220, '#e8e070', 2);
    jet(160, 210, 1.5, { col: '#4a5a6a', rot: -0.05 }); for (let i = 0; i < 4; i++) person(240 + i * 35, 245 - i * 2, 50, { top: ['#e8d030', '#d03030', '#30a040', '#3060d0'][i], hat: 'helmet', hatCol: ['#e8d030', '#d03030', '#30a040', '#3060d0'][i], pose: i === 0 ? 'point' : 'stand' });
    haze('#ffa060', 0.15);
  },
  () => { // racing the jet on the motorcycle down the runway
    sky('#f8a050', '#ffe8b0', 190); ground(190, '#6a5a4a', '#3a3a3a'); rect(0, 220, VW, 40, '#2a2a2a'); for (let x = 0; x < VW; x += 40) rect(x + M * 10, 238, 22, 3, '#eee');
    jet(260 + M * 6, 150, 1.8, { col: '#5a6a7a', rot: -0.15, flame: true });
    at(130 + M * 8, 255, 1.4, 1, () => { circ(-20, -8, 8, '#111'); circ(20, -8, 8, '#111'); poly([-22, -14, 16, -20, 26, -10, -16, -8], '#2a2a2a'); person(-4, -14, 34, { top: '#5a3a20', bottom: '#2a3a5a', glasses: '#000', pose: [1.3, 1.3, 1.0, 0.6] }); });
    haze('#ff9050', 0.15);
  },
] };

ART['raiders-lost-bark'] = { g: 'adventure', p: 0, s: [
  () => { // the rolling boulder
    rect(0, 0, VW, VH, '#2a1a0a'); poly([0, 0, 400, 0, 300, 90, 100, 90], '#3a2410'); poly([0, 290, 400, 290, 300, 180, 100, 180], '#4a3018');
    poly([0, 0, 100, 90, 100, 180, 0, 290], '#1a1004'); poly([400, 0, 300, 90, 300, 180, 400, 290], '#1a1004');
    glow(200, 130, 140, 'rgba(255,170,80,0.35)');
    const bx = 200, by = 130 - M * 4, br = 74 + M * 6; circ(bx, by, br, '#6a5a44'); c.save(); c.translate(bx, by); c.rotate(M * 2); for (let i = 0; i < 8; i++) ell(Math.cos(i) * br * 0.6, Math.sin(i * 1.7) * br * 0.6, 10, 6, 'rgba(0,0,0,0.2)', i); c.restore();
    person(200, 280 + M * 2, 120, { top: '#c8b080', bottom: '#6a5a3a', hat: 'fedora', hatCol: '#6a4a2a', pose: 'run', facing: 1 });
  },
  () => { // the pit of snakes, and a squirrel
    rect(0, 0, VW, VH, '#1a1008'); glow(120, 80, 160, 'rgba(255,150,60,0.4)'); for (const x of [120, 300]) { rect(x - 2, 60, 4, 30, '#3a2a1a'); poly([x - 6, 62, x, 40 - wob(4, 3), x + 6, 62], '#ffa030'); glow(x, 50, 30, 'rgba(255,170,60,0.6)'); }
    ground(180, '#3a2a18', '#1a1008');
    for (let i = 0; i < 12; i++) { const r2 = seeded(i + 90); snake(30 + r2() * 340, 190 + r2() * 90, 0.8 + r2() * 0.6, ['#4a5a2a', '#5a4a2a', '#3a4a1a'][i % 3], r2() * 6); }
    squirrel(300, 175, 1.8, '#a0602a'); person(160, 180, 90, { top: '#c8b080', bottom: '#6a5a3a', hat: 'fedora', hatCol: '#6a4a2a', pose: 'hold', prop: () => { line(0, 0, 0, 20, '#ffa030', 3); } });
  },
  () => { // the Ark (of bark) is opened. Do not look.
    rect(0, 0, VW, VH, '#0a0a14'); rays(200, 170, 16, 'rgba(255,255,230,0.12)', 400, 0.04, M * 0.2); glow(200, 150, 150, 'rgba(255,255,220,0.6)');
    rr(140, 170, 120, 60, 4, '#6a4a2a'); for (let i = 0; i < 6; i++) line(145 + i * 20, 175, 150 + i * 18, 225, '#4a2a10', 2); rect(130, 180, 140, 6, '#c89a30');
    for (let i = 0; i < 4; i++) ghost(80 + i * 80 + wob(6, 1, i * 0.3), 120 + (i % 2) * 30, 1.2, 'rgba(230,240,255,0.5)');
  },
  () => { // the warehouse: crates as far as the eye can see
    rect(0, 0, VW, VH, '#2a2620'); for (let i = 0; i < 6; i++) rect(0, i * 10, VW, 3, '#1a1814');
    for (let k = 0; k < 6; k++) { const sc = 1 - k * 0.14, y = 290 - k * 30; for (let i = 0; i < 10; i++) crate(200 + (i - 5) * 70 * sc - 20 * sc, y - 60 * sc, 60 * sc, 55 * sc, k % 2 ? '#8a6a3a' : '#7a5a30'); }
    person(170 + M * 8, 290, 70, { top: '#666', bottom: '#444', hat: 'cap', pose: 'walk', prop: () => crate(-8, -6, 16, 14, '#8a6a3a') });
  },
] };

ART['the-germinator'] = { g: 'steel', p: 0, s: [
  () => { // the chrome skull among the flowerpots, red eye glowing
    rect(0, 0, VW, VH, '#05080f'); glow(200, 130, 180, 'rgba(80,120,200,0.25)');
    for (let i = 0; i < 6; i++) { poly([20 + i * 66, 240, 64 + i * 66, 240, 58 + i * 66, 280, 26 + i * 66, 280], '#8a4a2a'); for (let k = 0; k < 3; k++) ell(42 + i * 66 + (k - 1) * 10, 228 - k * 4, 6, 12, '#2a6a2a', (k - 1) * 0.5); }
    skull(200, 140, 4.2, '#c8d0e0', { eye: '#ff2020', eye2: '#111' }); glow(175, 128, 30 + wob(4, 3), 'rgba(255,40,30,0.8)');
    line(175, 128, 0, 60, 'rgba(255,40,30,0.5)', 1.5);
  },
  () => { // the future war: hunter-killers over a field of weeds
    sky('#0a0a1a', '#2a2a4a', 200); ground(200, '#1a1a20', '#05050a');
    for (let i = 0; i < 15; i++) { const r2 = seeded(i + 3); skull(r2() * 400, 220 + r2() * 70, 0.6 + r2() * 0.5, '#8a8a9a'); }
    for (let i = 0; i < 20; i++) { const r2 = seeded(i + 30); line(r2() * 400, 290, r2() * 400 + 4, 230 + r2() * 30, '#2a4a2a', 2); }
    for (let i = 0; i < 2; i++) { const x = 120 + i * 180 + M * 6, y = 80 + i * 30; poly([x - 40, y, x + 40, y, x + 30, y + 12, x - 30, y + 12], '#3a3a4a'); glow(x - 30, y + 14, 20, 'rgba(120,180,255,0.6)'); glow(x + 30, y + 14, 20, 'rgba(120,180,255,0.6)'); line(x, y + 12, x - 60, 290, 'rgba(120,180,255,0.7)', 2); }
  },
  () => { // leather jacket, sunglasses, watering can
    sky('#2a3a5a', '#6a7aa0', 220); skyline(225, '#1a2234', 61, { minH: 30, maxH: 100, win: '#9ab0e0', lit: 0.2 }); ground(220, '#2a3040', '#10121a'); glow(300, 60, 120, 'rgba(160,190,255,0.4)');
    person(200, 290, 200, { top: '#1a1a1a', bottom: '#2a2a3a', hairStyle: 'short', hair: '#2a1a10', glasses: '#000', pose: 'hold', coat: '#1a1a1a', prop: () => { at(0, 0, 0.6, 1, () => { rr(-10, -6, 30, 24, 5, '#5a8a5a'); line(18, 0, 34, -14, '#5a8a5a', 4); circ(-14, 4, 8, 'rgba(0,0,0,0)'); }); } });
    at(90, 290, 1.4, 1, () => { circ(-20, -10, 10, '#111'); circ(24, -10, 10, '#111'); poly([-24, -18, 20, -24, 30, -12, -18, -10], '#333'); });
  },
  () => { // the red HUD view: TARGET ACQUIRED: WEEDS
    sky('#5a1010', '#a03a30', 180); ground(180, '#6a1a14', '#3a0806'); for (let i = 0; i < 8; i++) pine(i * 55, 200, 1, '#3a0a08');
    for (let i = 0; i < 5; i++) { const x = 160 + i * 22, y = 236 + (i % 2) * 8; line(x, y, x - 4, y - 30, '#1a0202', 3); ell(x - 4, y - 32, 9, 5, '#1a0202', 0.4); ell(x + 2, y - 20, 7, 4, '#1a0202', -0.4); }
    c.strokeStyle = '#ff6060'; c.lineWidth = 1.5; c.strokeRect(150 + wob(3), 190, 110, 60); line(205, 170, 205, 270, '#ff6060', 0.8); line(130, 220, 280, 220, '#ff6060', 0.8);
    ['TARGET: WEEDS', 'MATCH 99.8%', 'ACTION: MULCH', 'I’LL BE BACK'].forEach((s, i) => txt(s, 18, 30 + i * 16, 11, '#ffd0d0', { font: 'Consolas, monospace', align: 'left' }));
    haze('#ff0000', 0.18);
  },
] };

ART['forrest-stump'] = { g: 'warm', p: 0, s: [
  () => { // on the bench with a box of woodchips, a feather drifts down
    sky('#8ab8d8', '#d8e8e0', 150); for (let i = 0; i < 4; i++) tree(40 + i * 110, 160, 1.6, '#4a7a3a', '#4a3020', i);
    ground(170, '#7a9a5a', '#5a7a3a'); rect(0, 210, VW, 80, '#c8c0b0');
    rect(110, 200, 180, 8, '#6a4a2a'); rect(110, 170, 180, 6, '#6a4a2a'); rect(120, 208, 6, 30, '#333'); rect(274, 208, 6, 30, '#333');
    person(200, 250, 100, { top: '#f0f0e8', bottom: '#d8d0b8', pose: 'sit', hair: '#6a4a2a', smile: true, prop: () => { rr(-6, -10, 20, 14, 2, '#f4e8d0'); rect(-6, -10, 20, 4, '#8a5a30'); } });
    at(120 + wob(10), 60 + M * 6, 1, 1, () => { ell(0, 0, 14, 3, '#f8f8f8', 0.3); line(-14, -4, 14, 4, '#ddd', 0.8); });
  },
  () => { // running across America, followers behind
    sky('#e8a060', '#f8e0b0', 180); svg('M 40 180 L 50 110 L 80 100 L 90 180 Z', '#b0502a'); svg('M 280 180 L 290 80 L 320 70 L 330 180 Z', '#a0482a'); svg('M 340 180 L 345 130 L 370 125 L 375 180 Z', '#b05a30');
    ground(180, '#c88a50', '#8a5a30'); poly([190, 180, 210, 180, 330, 290, 70, 290], '#3a3a3a'); for (let i = 0; i < 5; i++) rect(198, 186 + i * 22, 4, 10 + i * 2, '#e8d070');
    person(200 + wob(1), 280, 90, { top: '#d8c8b0', bottom: '#8a6a4a', hat: 'cap', hatCol: '#c01818', hairStyle: 'beard', hair: '#6a4a2a', pose: 'run' });
    for (let i = 0; i < 6; i++) person(170 + (i % 3) * 30, 220 - Math.floor(i / 3) * 14, 30 - Math.floor(i / 3) * 8, { top: ['#e05050', '#5080e0', '#e0c050'][i % 3], pose: 'run' });
  },
  () => { // the shrimp boat in the storm
    sky('#2a3a4a', '#5a6a6a', 170); pline([300, 0, 290, 40, 310, 50, 290, 100], '#fff', 2.5); rain(7, 160, 'rgba(220,230,255,0.5)', 0.35);
    sea(170, '#2a4a5a', '#0a1a2a', 'rgba(255,255,255,0.5)', 6); svg('M 0 0 C 40 -40 80 -40 120 0 Z', '#3a5a6a', 30, 200, 1);
    boat(220 + wob(4), 210, 2.6, { name: 'JENNY', hull: '#e8e0d0', trim: '#2a5a8a' }); line(230, 150, 270, 100, '#555', 1.5); line(220, 150, 180, 100, '#555', 1.5);
    person(250, 182, 30, { top: '#e8e0d0', pose: 'armsUp', hairStyle: 'beard' });
  },
  () => { // the tree stump in the meadow
    sky('#a8d0e8', '#f0f0e0', 170); tree(330, 180, 2.4, '#4a8a3a', '#4a3020', 7); ground(170, '#8ab05a', '#5a8a3a');
    for (let i = 0; i < 30; i++) { const r2 = seeded(i + 6); circ(r2() * 400, 180 + r2() * 110, 1.6, ['#fff', '#f8e060', '#e080a0'][i % 3]); }
    rect(150, 210, 70, 40, '#7a5030'); ell(185, 210, 35, 10, '#c8a070'); for (let i = 1; i < 4; i++) c.beginPath(), c.ellipse(185, 210, i * 9, i * 2.5, 0, 0, TAU), c.strokeStyle = '#8a6040', c.lineWidth = 1, c.stroke();
    person(260, 280, 80, { top: '#f0e8e0', dress: true, hairStyle: 'long', hair: '#d8b060' }); person(110 + M * 3, 280, 50, { top: '#5080c0', bottom: '#3a3a5a', pose: 'run' });
  },
] };

ART['dye-hard'] = { g: 'teal', p: 0, s: [
  () => { // the tower at night: explosions on the salon floors, a helicopter
    sky('#0a1020', '#2a3a5a'); stars(40, 8, 120);
    rect(130, 40, 140, 250, '#1a2030'); for (let y = 50; y < 290; y += 10) for (let x = 136; x < 266; x += 8) rect(x, y, 5, 6, h2(x, y, 1) < 0.35 ? '#e8d890' : '#2a3040');
    for (let i = 0; i < 3; i++) { const x = 150 + i * 50, y = 60 + i * 6; glow(x, y, 50 + wob(6, 3, i), 'rgba(255,140,40,0.7)'); circ(x, y, 14, '#ffd070'); }
    heli(320 + M * 6, 70, 1.2, '#111'); skyline(290, '#05080f', 12, { minH: 30, maxH: 90, win: '#c8b070', lit: 0.3 });
  },
  () => { // crawling through the air vent with a lighter
    rect(0, 0, VW, VH, '#0a0a0a'); for (let i = 0; i < 8; i++) { const k = i / 8; const w = 400 * (1 - k * 0.85), hh = 290 * (1 - k * 0.85); c.strokeStyle = `rgba(160,170,180,${0.5 - k * 0.4})`; c.lineWidth = 2; c.strokeRect(200 - w / 2, 145 - hh / 2, w, hh); }
    glow(250, 140, 120, 'rgba(255,170,80,0.5)'); line(200, 290, 200, 145, 'rgba(160,170,180,0.15)', 1);
    bust(200, 150, 1.4, { top: '#e8e4dc', hair: '#3a2a1a', look: 3, mouth: 'flat', extra: () => { rect(-30, 50, 30, 40, '#e8e4dc'); } });
    rr(260, 120, 12, 18, 2, '#c8c8c8'); poly([262, 120, 266, 102 - wob(3, 4), 270, 120], '#ffc040');
  },
  () => { // the salon: a row of chairs, dye bowls, shattering glass, Christmas lights
    room('#2a1a2a', '#1a1a20', 190, { tiles: 'rgba(255,255,255,0.08)' }); for (let i = 0; i < 28; i++) circ(i * 15, 20 + Math.sin(i) * 4, 3, ['#ff3030', '#30ff60', '#3080ff', '#ffd030'][i % 4]);
    for (let i = 0; i < 4; i++) { const x = 60 + i * 95; rr(x - 30, 40, 60, 90, 6, '#8ab0c0'); chair(x, 240, 1.4, '#c01818'); bowl(x + 30, 200, 0.6, '#eee', ['#c03080', '#3080c0', '#e0a020', '#30a040'][i]); }
    for (let i = 0; i < 18; i++) { const r2 = seeded(i + 33); poly([300 + r2() * 90, 30 + r2() * 120, 306 + r2() * 90, 34 + r2() * 120, 302 + r2() * 90, 40 + r2() * 120], 'rgba(220,240,255,0.7)'); }
  },
  () => { // the villain falls from the tower in slow motion, a cloud of hair dye
    sky('#0a1020', '#1a2a40'); rect(0, 0, 120, VH, '#2a3040'); for (let y = 0; y < VH; y += 14) for (let x = 6; x < 114; x += 12) rect(x, y, 8, 9, '#3a4a5a');
    for (let i = 0; i < 40; i++) { const r2 = seeded(i + 7); circ(180 + r2() * 160, 160 + r2() * 120, 2 + r2() * 6, ['rgba(220,60,160,0.5)', 'rgba(120,60,220,0.5)'][i % 2]); }
    person(250, 160 + M * 6, 110, { top: '#2a2a2a', coat: '#3a3a3a', bottom: '#2a2a2a', pose: 'armsUp', rot: 0.4, hair: '#8a2a8a' });
    skyline(290, '#05080f', 2, { minH: 10, maxH: 40, win: '#e8d070' });
  },
] };

ART['free-wifi'] = { g: 'bright', p: 0, s: [
  () => { // the router leaps over the breakwater, the boy cheers
    sky('#5ab0f0', '#d0f0ff', 170); clouds(8, 4, 30, 100); sea(170, '#2a8ad0', '#1a5a90', 'rgba(255,255,255,0.5)', 10);
    rect(0, 220, VW, 70, '#8a8a80'); for (let x = 0; x < VW; x += 30) rr(x + 2, 214, 26, 14, 4, '#9a9a90');
    router(220, 120 - wob(4), 2.4, { rot: -0.3, waves: true }); for (let i = 0; i < 8; i++) circ(170 + i * 12, 170 + Math.abs(i - 4) * 4, 3, 'rgba(255,255,255,0.8)');
    person(100, 270, 80, { top: '#e8d040', bottom: '#3a5a9a', pose: 'armsUp', hairStyle: 'curly', hair: '#3a2010' });
  },
  () => { // the aquarium: a boy's face pressed to the glass, a router inside
    rect(0, 0, VW, VH, '#0a2a4a'); c.fillStyle = lg(0, 0, 0, VH, ['#3a9ad0', '#0a3a6a']); c.fillRect(40, 20, 320, 200);
    rays(200, 0, 6, 'rgba(255,255,255,0.08)', 240, 0.06, 1.2); router(200 + wob(10), 120, 2.0, { waves: true });
    for (let i = 0; i < 10; i++) circ(80 + i * 30, 200 - (i * 30 + M * 20) % 180, 2, 'rgba(255,255,255,0.5)');
    rect(0, 220, VW, 70, '#2a2a2a'); bust(320, 250, 0.9, { top: '#e8d040', hair: '#3a2010', hairStyle: 'spiky', look: -4, mouth: 'o' });
  },
  () => { // free at last: the router swims into the sunset, full bars
    sky('#f8a050', '#ffe8c0', 170); sun(200, 165, 30); sea(170, '#d87a5a', '#3a3a6a', 'rgba(255,220,180,0.4)', 4);
    router(200 + M * 4, 196, 1.4, { waves: true });
    for (let i = 0; i < 4; i++) rect(330 + i * 12, 50 - i * 8, 8, 14 + i * 8, '#fff');
  },
] };

ART['mad-snacks'] = { g: 'fury', p: 0, s: [
  () => { // the war rig tears across the desert, dust behind
    sky('#2a8ac8', '#f8c080', 190); ground(190, '#d8803a', '#a04a1a'); for (let i = 0; i < 10; i++) { const r2 = seeded(i); ell(r2() * 400, 200 + r2() * 90, 20, 3, 'rgba(120,40,10,0.4)'); }
    for (let i = 0; i < 8; i++) circ(40 + i * 18 - M * 6, 210 - i * 4, 18 + i * 4, `rgba(220,140,80,${0.5 - i * 0.05})`);
    truck(250 + M * 6, 250, 1.5, { col: '#2a2a2a', tank: '#a8a8a0' });
    at(275 + M * 6, 160, 1, 1, () => { rr(-20, -10, 40, 12, 3, '#e8c030'); txt('CHIPS', 0, -4, 8, '#c01818', { font: 'Arial Black' }); });
  },
  () => { // the flame-guitar player hangs off the speaker stack
    sky('#e86a2a', '#f8c070', 200); ground(200, '#c8602a', '#8a3a10');
    rect(110, 60, 180, 180, '#1a1a1a'); for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { circ(150 + k * 100, 90 + i * 55, 22, '#333'); circ(150 + k * 100, 90 + i * 55, 8, '#111'); }
    person(200, 200, 110, { top: '#c01818', bottom: '#4a2010', pose: 'hold', hair: '#e8e0d0', hairStyle: 'long', prop: () => { at(0, 0, 0.5, 1, () => { ell(0, 6, 18, 12, '#5a3a2a'); rect(10, -2, 40, 5, '#3a2a1a'); poly([50, -2, 54, -30 - wob(6, 4), 60, -2], '#ff9020'); poly([44, -2, 46, -20 - wob(5, 3), 50, -2], '#ffd040'); }); } });
  },
  () => { // the sandstorm with lightning inside
    rect(0, 0, VW, VH, '#c86a2a'); for (let i = 0; i < 9; i++) circ(200 + Math.sin(i * 1.4) * 100, 60 + i * 26, 110 - i * 6, `rgba(${100 + i * 10},${50 + i * 6},20,0.35)`);
    pline([180, 40, 200, 90, 186, 100, 210, 160], '#e8f0ff', 3); pline([280, 60, 270, 100, 290, 110, 266, 170], '#e8f0ff', 2); glow(200, 100, 80, 'rgba(255,255,255,0.4)');
    ground(240, '#a04a1a', '#6a2a08'); car(100 + M * 8, 270, 1.1, { col: '#3a3a3a' });
  },
  () => { // the buffet in the desert; chrome-mouthed and ready
    sky('#3a9ad0', '#f8d8a0', 180); ground(180, '#d8903a', '#a85a20');
    table(200, 210, 300, '#4a2a10', '#f0e8e0'); for (let i = 0; i < 6; i++) { ell(80 + i * 48, 208, 18, 5, '#ccc'); circ(80 + i * 48, 202, 9, ['#e8a030', '#c03020', '#f0d060', '#80a030', '#a05020', '#e8e0c0'][i]); }
    bust(200, 110, 1.0, { skin: '#e8e0d8', hair: '#111', hairStyle: 'short', top: '#2a2a2a', mouth: 'grin', extra: () => { ell(0, 18, 14, 9, '#d8d8e0'); ell(-4, 15, 4, 2, '#fff'); } });
  },
] };

ART['inspection'] = { g: 'teal', p: 0, s: [
  () => { // the city folds up over itself
    sky('#b8c8d0', '#e8eef0', 200);
    c.save(); c.translate(200, 300); for (let i = 0; i < 10; i++) { rect(-200 + i * 40, -60 - (i * 13) % 40, 36, 60 + (i * 13) % 40, ['#8a8a80', '#9a948a', '#7a7a74'][i % 3]); } c.restore();
    c.save(); c.translate(200, -20); c.scale(1, -1); for (let i = 0; i < 10; i++) { rect(-200 + i * 40, -110 - (i * 17) % 50, 36, 110 + (i * 17) % 50, ['#7a7a74', '#8a8a80', '#9a948a'][i % 3]); for (let k = 0; k < 6; k++) rect(-196 + i * 40, -100 + k * 16, 28, 6, '#5a6a70'); } c.restore();
    ground(240, '#7a7a74', '#5a5a54'); person(180 + M * 3, 284, 60, { top: '#2a2a2a', coat: '#3a3a3a', pose: 'walk', prop: () => rr(-4, -4, 10, 14, 1, '#f0f0e0') }); person(220 + M * 3, 284, 58, { top: '#c8b8a0', dress: true, pose: 'walk', hairStyle: 'bob' });
  },
  () => { // the spinning top on the table. Does it fall?
    rect(0, 0, VW, VH, '#1a2a2a'); glow(200, 150, 200, 'rgba(255,220,160,0.25)'); rect(0, 200, VW, 90, '#4a3020'); rect(0, 196, VW, 6, '#3a2010');
    at(200 + wob(1.5, 3), 196, 2.2, 1, () => { c.rotate(0.06 * Math.sin(M * TAU * 2)); poly([0, 0, -18, -24, 18, -24], '#a8a8a8'); ell(0, -24, 18, 6, '#c8c8c8'); rect(-2, -40, 4, 16, '#888'); });
    ell(200, 198, 30, 4, 'rgba(0,0,0,0.4)');
  },
  () => { // the rotating kitchen hallway: the inspector with his clipboard on the ceiling
    rect(0, 0, VW, VH, '#203030'); c.save(); c.translate(200, 145); c.rotate(0.5 + M * 0.06);
    rect(-300, -90, 600, 180, '#c8c0a8'); for (let i = -6; i < 6; i++) { rr(i * 60, -80, 40, 60, 3, '#8aa0a0'); rect(i * 60 + 5, 30, 30, 50, '#e8e8e0'); }
    person(-30, 90, 110, { top: '#f0f0e8', bottom: '#2a2a2a', tie: '#3a3a3a', pose: 'fight', prop: () => rr(-6, -8, 14, 18, 2, '#c8a060') });
    at(60, -90, 1, 1, () => { c.scale(1, -1); person(0, 0, 90, { top: '#f4f4f4', bottom: '#f4f4f4', hat: 'chef', pose: 'armsUp' }); });
    c.restore();
  },
  () => { // the van falls off the bridge in the rain, slowly
    sky('#3a4a50', '#7a8a90', 200); rain(15, 200, 'rgba(220,230,240,0.4)', 0.05, 18);
    rect(0, 70, 220, 14, '#3a3a3a'); for (let x = 0; x < 220; x += 20) rect(x, 50, 3, 20, '#3a3a3a'); rect(0, 48, 220, 3, '#3a3a3a'); rect(80, 84, 20, 206, '#2a2a2a');
    at(270, 140 + M * 6, 1.6, 1, () => { c.rotate(0.35); car(0, 0, 1, { style: 'van', col: '#a8a8b0' }); });
    sea(250, '#3a4a50', '#1a2a30', 'rgba(255,255,255,0.3)');
  },
] };

ART['silence-of-the-clams'] = { g: 'cold', p: 0, s: [
  () => { // her face, a clam where her mouth should be
    rect(0, 0, VW, VH, '#e8e4dc'); bust(200, 150, 2.4, { skin: '#f0dcc8', hair: '#6a4a2a', hairStyle: 'bob', top: '#2a2a2a', look: 0, wide: true, eyeY: -4 });
    clam(200, 202 + wob(1), 1.6, { col: '#c8b8a0', open: 0.1 + wob(0.05) });
    alpha(0.15, () => { c.fillStyle = rg(200, 150, 50, 260, ['rgba(0,0,0,0)', '#000']); c.fillRect(0, 0, VW, VH); });
  },
  () => { // the glass cell at the end of the corridor
    rect(0, 0, VW, VH, '#1a1a1a'); for (let i = 0; i < 6; i++) { const k = i / 6; rect(200 - 200 * (1 - k * 0.7), 20 + 50 * k, 400 * (1 - k * 0.7), 4, 'rgba(255,255,255,0.08)'); }
    rect(80, 40, 240, 220, '#3a3a38'); glow(200, 120, 150, 'rgba(240,240,220,0.25)');
    person(200, 260, 170, { top: '#e8e8e0', bottom: '#e8e8e0', hair: '#5a4a3a', smile: true, pose: 'stand', prop: undefined });
    rect(80, 40, 240, 220, 'rgba(200,220,230,0.12)'); for (let i = 0; i < 6; i++) circ(120 + i * 30, 80, 2, 'rgba(255,255,255,0.4)');
    rect(0, 260, VW, 30, '#0a0a0a');
  },
  () => { // night vision in the basement
    rect(0, 0, VW, VH, '#041004'); for (let i = 0; i < 5; i++) rect(i * 90, 0, 6, VH, '#0a200a');
    person(200 + wob(3), 280, 160, { top: '#3a7a3a', bottom: '#2a5a2a', skin: '#5aaa5a', hair: '#2a5a2a', hairStyle: 'bob', pose: [1.6, -0.6, 0.1, -0.2] });
    alpha(0.9, () => { circ(150, 140, 46, 'rgba(0,0,0,0)'); }); haze('#40ff40', 0.12);
    for (let y = 0; y < VH; y += 3) rect(0, y, VW, 1, 'rgba(0,0,0,0.25)');
  },
  () => { // the field at dawn: have the clams stopped screaming?
    sky('#c8d0d8', '#f0e8d8', 170); hills(170, 14, '#7a8a6a', 9); ground(180, '#8a9a6a', '#5a6a40');
    for (let x = 0; x < VW; x += 30) rect(x, 175, 4, 30, '#5a4a3a'); line(0, 182, VW, 182, '#5a4a3a', 2); line(0, 194, VW, 194, '#5a4a3a', 2);
    for (let i = 0; i < 14; i++) { const r2 = seeded(i + 21); clam(30 + r2() * 340, 220 + r2() * 60, 0.8 + r2() * 0.6, { face: true, open: 0.5 + wob(0.1, 2, i * 0.1) }); }
  },
] };

ART['apocalypse-chow'] = { g: 'napalm', p: 0, s: [
  () => { // helicopters against the orange sky, the treeline goes up
    sky('#f86a1a', '#ffd080', 200); sun(250, 150, 50, '#fff0b0', 'rgba(255,200,120,0.5)');
    for (let i = 0; i < 12; i++) circ(i * 36, 210 - (i % 3) * 10, 30 + (i % 4) * 8, 'rgba(255,120,20,0.6)');
    for (let i = 0; i < 12; i++) palm(i * 36, 260, 1.1 + (i % 3) * 0.2, '#1a0a04', (i % 2 ? 0.2 : -0.2));
    for (let i = 0; i < 4; i++) heli(80 + i * 85 + M * 6, 60 + (i % 2) * 30, 1.0, '#1a0a04', { glass: '#1a0a04' });
    ground(260, '#1a0a04');
  },
  () => { // the patrol boat goes upriver into the fog
    rect(0, 0, VW, VH, '#5a6a4a'); for (let i = 0; i < 14; i++) { const r2 = seeded(i + 3); circ(r2() * 400, 60 + r2() * 100, 30 + r2() * 20, '#2a3a1a'); }
    sea(170, '#4a5a3a', '#1a2a10', 'rgba(255,255,220,0.2)', 3); fog(80, 220, 'rgba(220,220,190,0.6)');
    boat(200 + M * 4, 210, 2.2, { hull: '#4a5a3a', cabin: '#3a4a2a', trim: '#2a3a1a' });
  },
  () => { // the face rises out of the black water, painted green
    rect(0, 0, VW, VH, '#0a100a'); glow(200, 120, 190, 'rgba(150,190,120,0.35)');
    bust(200, 150 - M * 4, 1.8, { skin: '#7a8a50', hair: '#0a0a0a', top: '#0a0a0a', look: 0, brow: 6, mouth: 'flat' });
    rect(0, 190, VW, 100, '#050805'); for (let i = 0; i < 6; i++) ring(200, 190, 60 + i * 30, 'rgba(120,160,100,0.15)', 1);
  },
  () => { // brunch on the beach while the treeline burns
    sky('#f88a3a', '#ffe0a0', 160); for (let i = 0; i < 6; i++) { circ(40 + i * 70, 150, 34, 'rgba(255,100,20,0.6)'); circ(40 + i * 70, 120, 22, 'rgba(80,40,20,0.5)'); }
    for (let i = 0; i < 8; i++) palm(i * 55, 170, 0.9, '#1a0a04');
    ground(170, '#e8c080', '#c8a060'); table(200, 220, 180, '#5a3a20', '#f4f0e8');
    for (let i = 0; i < 4; i++) { ell(140 + i * 40, 218, 14, 4, '#fff'); circ(140 + i * 40, 214, 6, ['#f0d040', '#c05020', '#e8c890', '#80a030'][i]); }
    person(310, 280, 110, { top: '#4a5a3a', bottom: '#3a4a2a', hat: 'cowboy', hatCol: '#1a1a1a', pose: 'point', glasses: '#000' });
  },
] };
// ===== cult =====
ART['pulp-friction'] = { g: 'seventies', p: 0, s: [
  () => { // two hitmen in black suits, pointing
    rect(0, 0, VW, VH, '#e8d8b0'); rect(0, 200, VW, 90, '#8a6a4a'); for (let i = 0; i < 6; i++) rect(30 + i * 65, 30, 40, 60, '#c8b890');
    for (const [x, f] of [[140, 1], [260, 1]]) person(x + wob(1), 290, 200, { top: '#111', coat: '#111', bottom: '#111', tie: '#111', shirt: '#f4f4f4', hairStyle: x > 200 ? 'curly' : 'short', hair: '#1a1008', pose: 'point', facing: f, prop: () => { rect(0, -3, 12, 5, '#222'); rect(0, -3, 4, 10, '#222'); } });
  },
  () => { // the diner booth: a five-dollar milkshake
    rect(0, 0, VW, VH, '#1a0a14'); neon('JACK RABBIT SLIMS', 200, 34, 20, '#ff4aa0'); rect(0, 60, VW, 230, '#3a1a2a');
    rr(40, 120, 70, 170, 8, '#c01818'); rr(290, 120, 70, 170, 8, '#c01818'); rect(110, 190, 180, 10, '#e8e8e0');
    person(150, 250, 100, { top: '#f4f4f4', hair: '#111', hairStyle: 'bob', pose: 'sit', skin: '#f0d8c8', dress: true });
    person(260, 250, 100, { top: '#111', hair: '#1a1008', pose: 'sit', facing: -1, tie: '#111' });
    at(200, 190, 1.4, 1, () => { poly([-8, 0, 8, 0, 10, -26, -10, -26], 'rgba(240,240,250,0.7)'); ell(0, -26, 10, 3, '#f0e0d0'); circ(0, -32, 4, '#c01818'); line(3, -26, 8, -44, '#e8e0d0', 2); });
  },
  () => { // the twist contest
    rect(0, 0, VW, VH, '#120810'); cone(200, -20, Math.PI / 2, 0.35, 300, 'rgba(255,220,180,0.35)');
    room('#120810', '#2a1a1a', 220, { tiles: 'rgba(255,255,255,0.12)' }); rect(0, 0, VW, 60, '#2a0a1a'); neon('TWIST', 200, 30, 18, '#40e0ff');
    person(160 + wob(3, 2), 270, 140, { top: '#f4f4f4', bottom: '#111', hairStyle: 'bob', hair: '#111', pose: [2.0 + wob(0.3, 2), -1.6, 0.3, -0.2], skin: '#f0d8c8', dress: false });
    person(250 - wob(3, 2), 270, 140, { top: '#111', bottom: '#111', tie: '#111', hair: '#1a1008', pose: [1.8, -2.2 + wob(0.3, 2), 0.4, -0.4], facing: -1 });
  },
  () => { // the briefcase glows gold. Nobody knows why.
    rect(0, 0, VW, VH, '#0a0805'); glow(200, 150, 180, 'rgba(255,200,80,0.6)');
    poly([90, 170, 310, 170, 330, 250, 70, 250], '#1a1410'); poly([90, 170, 310, 170, 290, 90, 110, 90], '#2a2018');
    rect(110, 160, 180, 12, '#ffe090'); rays(200, 165, 10, 'rgba(255,230,140,0.12)', 260, 0.05, -Math.PI / 2 + M * 0.1);
    bust(200, 240, 1.2, { skin: '#c8a070', hair: '#111', hairStyle: 'curly', top: '#111', mouth: 'o', look: 0 });
  },
] };

ART['blade-rummer'] = { g: 'cyber', p: 0, s: [
  () => { // the city in the rain: flying cars, a giant ad
    sky('#05050f', '#2a1a3a'); skyline(290, '#0a0a14', 7, { minH: 120, maxH: 270, minW: 24, win: '#ffb060', lit: 0.3 });
    rr(250, 60, 90, 110, 4, '#1a0a1a'); bust(295, 120, 0.7, { skin: '#f0d0d0', hair: '#0a0a0a', hairStyle: 'bun', top: '#c01828', lips: '#c01828', look: -2 }); glow(295, 115, 70, 'rgba(255,80,120,0.35)');
    neon('ラム', 80, 120, 26, '#40e0ff'); neon('RUM', 80, 150, 14, '#ff4ab0');
    for (let i = 0; i < 3; i++) { const x = 120 + i * 90 + M * 10, y = 70 + i * 40; poly([x - 18, y, x + 18, y, x + 14, y + 8, x - 14, y + 8], '#2a2a3a'); glow(x - 14, y + 6, 14, 'rgba(255,220,180,0.7)'); }
    rain(19, 220, 'rgba(180,200,255,0.35)', 0.1, 16);
  },
  () => { // the rooftop: tears and rum in the rain, a dove
    sky('#0a0a14', '#2a2a3a'); rect(0, 210, VW, 80, '#151520');
    person(200, 280, 150, { top: '#c8c8d0', bottom: '#2a2a2a', hair: '#f0f0f0', hairStyle: 'spiky', pose: 'sit', eyes: true, prop: () => { rr(-3, -10, 6, 14, 2, '#8a4a1a'); } });
    at(240 + M * 6, 120 - M * 10, 1.2, 1, () => { ell(0, 0, 10, 5, '#f4f4f4'); poly([-4, -2, -14, -14 - wob(4, 3), 4, -2], '#f4f4f4'); circ(8, -3, 3, '#f4f4f4'); });
    rain(4, 260, 'rgba(200,210,255,0.4)', 0.08, 18);
  },
  () => { // the eye, reflecting the flaming towers
    rect(0, 0, VW, VH, '#0a0505'); ell(200, 145, 180, 80, '#e8d8d0'); clipCirc(200, 145, 80, () => { circ(200, 145, 80, '#4a6a8a'); circ(200, 145, 36, '#050505');
      for (let i = 0; i < 6; i++) { rect(150 + i * 18, 130 - (i % 3) * 14, 10, 60, '#2a1a10'); glow(155 + i * 18, 125 - (i % 3) * 14, 12 + wob(3, 4, i), 'rgba(255,150,40,0.9)'); } });
    c.beginPath(); c.ellipse(200, 145, 180, 80, 0, 0, TAU); c.strokeStyle = '#3a1a14'; c.lineWidth = 10; c.stroke();
    circ(225, 120, 10, 'rgba(255,255,255,0.7)');
  },
  () => { // the noodle bar under the umbrellas
    rect(0, 0, VW, VH, '#0a0a14'); neon('ヌードル', 200, 40, 24, '#ffd040');
    rect(40, 120, 320, 30, '#5a3a2a'); rect(40, 150, 320, 140, '#2a1a14'); steam(200, 120, 6, 'rgba(255,255,255,0.3)', 60);
    for (let i = 0; i < 5; i++) { const x = 40 + i * 80; person(x, 290, 110, { top: '#3a3a4a', coat: '#3a3a4a', hair: '#1a1a1a', pose: 'hold' }); c.beginPath(); c.arc(x, 180, 40, Math.PI, 0); c.fillStyle = ['rgba(80,200,255,0.5)', 'rgba(255,80,180,0.5)'][i % 2]; c.fill(); line(x, 180, x, 210, '#ccc', 1.5); }
    rain(23, 150, 'rgba(200,210,255,0.35)', 0.05);
  },
] };

ART['the-big-lebowl'] = { g: 'seventies', p: 1, s: [
  () => { // the lanes: a strike in progress
    rect(0, 0, VW, VH, '#1a1020'); for (let i = 0; i < 4; i++) { poly([120 + i * 40, 80, 150 + i * 40, 80, i * 130 + 30, 290, i * 130 - 50, 290], '#d8a868'); line(120 + i * 40, 80, i * 130 - 50, 290, '#a07040', 1); }
    for (let i = 0; i < 6; i++) { neon(['★', '●', '★'][i % 3], 40 + i * 64, 30, 18, ['#ff4ab0', '#40e0ff', '#ffd040'][i % 3]); }
    for (let r2 = 0; r2 < 4; r2++) for (let k = 0; k <= r2; k++) { const x = 200 - r2 * 6 + k * 12 + (r2 === 0 ? wob(2) : 0); at(x, 100 - r2 * 6, 0.8, 1, () => { ell(0, -8, 4, 8, '#f4f4f4'); circ(0, -18, 3, '#f4f4f4'); rect(-3, -14, 6, 1.5, '#d01818'); }); }
    circ(200 + M * 4, 230 - M * 40, 20 - M * 4, '#2a1a40'); circ(194 + M * 4, 224 - M * 40, 3, '#000');
  },
  () => { // the Dude in his bathrobe and sunglasses, a bowl of cereal
    rect(0, 0, VW, VH, '#e8e0c8'); for (let k = 0; k < 3; k++) { rect(0, 40 + k * 70, VW, 6, '#b0a080'); for (let i = 0; i < 18; i++) rect(5 + i * 22, 10 + k * 70, 16, 30, ['#e04040', '#f0c030', '#3070d0', '#40a060'][(i + k) % 4]); }
    person(200, 290, 210, { top: '#c8b090', coat: '#a89070', bottom: '#5a4a3a', hairStyle: 'long', hair: '#5a3a1a', glasses: '#111', pose: 'hold', prop: () => { at(0, 0, 0.55, 1, () => bowl(0, 0, 1, '#f4f4f4', '#e8c060')); } });
  },
  () => { // the rug that tied the room together, a cereal bowl in the middle
    room('#c8a070', '#6a4a2a', 120); rect(150, 30, 100, 70, '#e8e0d0'); for (let i = 0; i < 4; i++) line(150, 40 + i * 16, 250, 40 + i * 16, '#c0b0a0', 1);
    c.save(); c.translate(200, 210); c.scale(1, 0.4); for (let i = 7; i > 0; i--) { rr(-i * 22, -i * 22, i * 44, i * 44, 6, ['#8a2a1a', '#e8d0a0', '#3a5a6a', '#c8902a', '#5a2a1a', '#e8d0a0', '#2a3a5a'][i - 1]); } c.restore();
    bowl(200, 215, 1.2, '#f4f4f4', '#e8c060');
  },
  () => { // the dream: flying over LA, holding a bowling ball
    sky('#1a0a3a', '#6a2a8a'); stars(70, 3); for (let i = 0; i < 30; i++) circ(i * 14, 280 - (i * 31) % 20, 1.5, '#ffd060');
    skyline(290, '#0a0414', 44, { minH: 10, maxH: 50, win: '#ffd060', lit: 0.6 });
    person(200 + wob(4), 140 + wob(3, 1, 0.3), 90, { top: '#e8e0c8', bottom: '#5a4a3a', hairStyle: 'long', hair: '#5a3a1a', pose: 'out', rot: 1.3, prop: () => circ(4, 0, 9, '#2a1a40') });
    for (let i = 0; i < 4; i++) person(60 + i * 90, 260, 50, { sil: '#e8e0f8', dress: true, hat: 'chef', pose: 'armsUp' });
  },
] };

ART['the-shinning'] = { g: 'overlook', p: 2, s: [
  () => { // aerial: the little car on the mountain road
    rect(0, 0, VW, VH, '#2a3a2a'); sky('#a8b8c8', '#dfe8ee', 80); mountains(70, 50, '#5a6a6a', 4, 5, '#f0f0f0'); rect(0, 70, VW, 220, '#2a3a2a'); for (let i = 0; i < 120; i++) { const r2 = seeded(i); pine(r2() * 420 - 10, r2() * 320, 0.4 + r2() * 0.3, ['#1a2a1a', '#24382a', '#2a402a'][i % 3]); }
    c.beginPath(); c.moveTo(-10, 240); c.bezierCurveTo(100, 220, 120, 120, 220, 110); c.bezierCurveTo(300, 100, 330, 40, 420, 30); c.strokeStyle = '#8a8070'; c.lineWidth = 14; c.stroke(); c.strokeStyle = '#e8e0c0'; c.lineWidth = 1; c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]);
    at(150 + M * 8, 156 - M * 10, 0.45, 1, () => car(0, 0, 1, { col: '#e8c030' }));
  },
  () => { // the hallway: hexagon carpet, the twins
    room('#c8a878', '#8a3a1a', 170); for (let y = 175; y < 290; y += 18) for (let x = (y / 18 % 2) * 14; x < VW; x += 28) { poly([x, y, x + 7, y - 6, x + 21, y - 6, x + 28, y, x + 21, y + 6, x + 7, y + 6], '#c8601a'); poly([x + 6, y, x + 10, y - 3, x + 18, y - 3, x + 22, y, x + 18, y + 3, x + 10, y + 3], '#3a1a10'); }
    rect(120, 30, 160, 140, '#3a2010'); rect(130, 40, 140, 130, '#2a1408');
    for (const x of [180, 220]) person(x, 170, 100, { top: '#8ab0d8', dress: true, hairStyle: 'bob', hair: '#5a3a1a', skin: '#f0dcd0' });
    txt('REDRUM', 330, 90, 14, '#a01010', { font: '"Comic Sans MS", cursive' });
  },
  () => { // here's Jack: a face through the broken door, a shin guard
    rect(0, 0, VW, VH, '#e8e0d0'); rect(80, 0, 240, VH, '#d8c8b0'); for (let y = 0; y < VH; y += 60) rect(90, y + 10, 220, 44, '#c8b8a0');
    poly([150, 90, 260, 70, 270, 180, 160, 200, 140, 150], '#1a1a1a');
    bust(205 + wob(2), 150, 1.05, { skin: '#e8c8a8', hair: '#3a2a1a', hairStyle: 'short', top: '#a01818', mouth: 'grin', brow: 4, wide: true });
    for (let i = 0; i < 6; i++) poly([150 + i * 20, 90 - (i % 2) * 10, 160 + i * 20, 80, 170 + i * 20, 92], '#d8c8b0');
    at(90, 190, 1, 1, () => { rr(-14, -40, 28, 60, 10, '#f4f4f4'); for (let i = 0; i < 5; i++) line(-12, -30 + i * 10, 12, -30 + i * 10, '#c01818', 2); });
  },
  () => { // the hedge maze in the snow at night
    sky('#05081a', '#1a2a4a', 110); moon(320, 40, 12);
    c.save(); c.translate(200, 110); for (let r2 = 0; r2 < 8; r2++) { const y = r2 * 24, sc = 1 + r2 * 0.4; for (let i = -6; i <= 6; i++) if ((i + r2) % 3) rect(i * 40 * sc - 18 * sc, y, 34 * sc, 18 + r2 * 4, '#0a1a14'); rect(-400, y + 18 + r2 * 4, 800, 6 + r2 * 2, '#c8d8f0'); } c.restore();
    snow(41, 120); glow(200, 230, 60, 'rgba(255,220,150,0.25)'); person(200, 260, 40, { sil: '#0a0a0a', pose: 'run', facing: -1 });
  },
] };

ART['lace-odyssey'] = { g: 'space', p: 0, s: [
  () => { // sun, earth and moon line up. A doily border.
    rect(0, 0, VW, VH, '#000'); stars(80, 8);
    c.save(); c.beginPath(); c.arc(200, 470, 260, 0, TAU); c.fillStyle = '#5a5a5a'; c.fill(); c.restore();
    c.beginPath(); c.arc(200, 330, 140, Math.PI, 0); c.fillStyle = '#1a3a6a'; c.fill(); glow(200, 190, 80, 'rgba(255,255,240,0.6)');
    sun(200, 186, 12, '#fff', 'rgba(255,255,230,0.8)');
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; circ(200 + Math.cos(a) * 190, 145 + Math.sin(a) * 140, 4, 'rgba(240,235,220,0.18)'); }
  },
  () => { // HAL's red eye, framed in crochet
    rect(0, 0, VW, VH, '#151515'); rr(130, 30, 140, 230, 6, '#2a2a2a'); rect(140, 40, 120, 30, '#111'); txt('HAL 9000', 200, 56, 11, '#ddd', { font: 'Arial', spacing: 2 });
    circ(200, 160, 44, '#3a3a3a'); circ(200, 160, 34, '#000'); glow(200, 160, 40 + wob(2, 2), 'rgba(255,20,20,0.8)'); circ(200, 160, 7, '#ffd040');
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; circ(200 + Math.cos(a) * 52, 160 + Math.sin(a) * 52, 5, 'rgba(250,245,230,0.85)'); ring(200 + Math.cos(a) * 60, 160 + Math.sin(a) * 60, 3, 'rgba(250,245,230,0.6)', 1); }
    txt('I need more yarn, Dave.', 200, 275, 12, '#ddd', { style: 'italic' });
  },
  () => { // the wheel station turns, a shuttle docks, knitting needles cross
    rect(0, 0, VW, VH, '#000'); stars(150, 12); circ(60, 240, 80, '#2a4a8a'); glow(60, 240, 100, 'rgba(120,170,255,0.2)');
    c.save(); c.translate(240, 120); c.rotate(M * 0.4); ring(0, 0, 70, '#e8e8e8', 10); ring(0, 0, 70, '#888', 2); for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); rect(-3, 0, 6, 70, '#ccc'); } circ(0, 0, 12, '#ddd'); c.restore();
    line(80, 40, 360, 260, '#c8a060', 4); line(360, 40, 80, 260, '#c8a060', 4); circ(80, 40, 6, '#c8a060'); circ(360, 40, 6, '#c8a060');
    jet(120 + M * 6, 200, 0.6, { col: '#ddd' });
  },
  () => { // the star child: a ball of yarn hangs over the Earth
    rect(0, 0, VW, VH, '#000'); stars(100, 15); c.beginPath(); c.arc(200, 400, 200, Math.PI, 0); c.fillStyle = '#2a5aa0'; c.fill(); glow(200, 230, 140, 'rgba(120,170,255,0.2)');
    circ(200, 110 + wob(2), 60, '#c86a8a'); for (let i = 0; i < 12; i++) { c.beginPath(); c.ellipse(200, 110 + wob(2), 60, 20 + i * 3, i * 0.5, 0, TAU); c.strokeStyle = 'rgba(255,200,220,0.5)'; c.lineWidth = 1.5; c.stroke(); }
    glow(200, 110, 110, 'rgba(255,180,220,0.25)'); pline([200, 170, 220, 210, 190, 250, 210, 290], '#c86a8a', 2);
  },
] };

ART['rocky-horror-pastry'] = { g: 'midnight', p: 0, s: [
  () => { // the lips sing on black
    rect(0, 0, VW, VH, '#000');
    const o = 0.5 + wob(0.4, 2);
    svg('M -110 0 C -80 -40 -30 -46 0 -30 C 30 -46 80 -40 110 0 C 70 10 30 12 0 12 C -30 12 -70 10 -110 0 Z', '#d00a1a', 200, 140 - o * 10, 1.2);
    svg('M -110 0 C -70 60 70 60 110 0 C 70 10 30 12 0 12 C -30 12 -70 10 -110 0 Z', '#c0081a', 200, 145 + o * 10, 1.2);
    ell(200, 148, 80, 6 + o * 16, '#1a0004'); rect(140, 140 - o * 2, 120, 7, '#f4f4f0');
    ell(150, 115 - o * 10, 30, 6, 'rgba(255,255,255,0.35)');
  },
  () => { // the castle in the thunderstorm, the couple under a newspaper
    sky('#05050f', '#1a1a3a'); pline([300, 0, 290, 50, 310, 60, 280, 140], '#fff', 3); glow(290, 70, 140, 'rgba(220,220,255,0.3)');
    castle(220, 220, 0.9, '#0a0a14', { lit: '#ffd060' }); ground(220, '#0a0a10');
    person(130, 280, 80, { top: '#e8e0d8', bottom: '#2a2a3a', glasses: '#111', pose: 'armsUp' }); person(160, 280, 78, { top: '#f0c0d0', dress: true, hairStyle: 'bob', hair: '#c89040', pose: 'armsUp' });
    rect(115, 182, 60, 6, '#e8e0d0'); rain(8, 200);
  },
  () => { // the sweet transvestite, in pearls, with croissants
    rect(0, 0, VW, VH, '#1a0008'); cone(200, -20, Math.PI / 2, 0.3, 320, 'rgba(255,200,220,0.35)');
    person(200, 280, 220, { top: '#1a0a0a', bottom: '#1a0a0a', hair: '#0a0a0a', hairStyle: 'curly', skin: '#f0dcd8', pose: 'armsUp', cape: '#3a0a1a' });
    for (let i = 0; i < 7; i++) circ(188 + i * 4, 112 + Math.sin(i / 6 * Math.PI) * 8, 2.4, '#f4f4f0');
    for (let i = 0; i < 2; i++) at(120 + i * 160, 60, 1.2, 1, () => { svg('M -20 0 C -10 -14 10 -14 20 0 C 10 4 -10 4 -20 0 Z', '#d8902a'); for (let k = -1; k <= 1; k++) line(k * 7, -10, k * 6, 2, '#a05a10', 1); });
  },
  () => { // the time warp: a dance diagram
    rect(0, 0, VW, VH, '#e8e0d0'); txt('IT’S JUST A JUMP TO THE LEFT', 200, 30, 16, '#c00a1a', { font: '"Arial Black", Impact' });
    for (let i = 0; i < 4; i++) { const x = 60 + i * 95; person(x + (i === 0 ? -10 : 0), 240, 120, { sil: '#111', pose: [['armsUp', 'out', 'stand', 'dance'][i]].map(p => POSES[p])[0], rot: i === 2 ? 0.25 : 0 }); }
    pline([60, 260, 30, 260], '#c00a1a', 3); poly([26, 260, 36, 254, 36, 266], '#c00a1a'); pline([155, 260, 185, 260], '#c00a1a', 3); poly([189, 260, 179, 254, 179, 266], '#c00a1a');
    txt('1', 60, 278, 12, '#111'); txt('2', 155, 278, 12, '#111'); txt('3', 250, 278, 12, '#111'); txt('4', 345, 278, 12, '#111');
  },
] };

ART['groundhog-bae'] = { g: 'warm', p: 0, s: [
  () => { // the groundhog is held aloft in the snowy square
    sky('#a8b8c8', '#e0e8f0', 160); for (let i = 0; i < 5; i++) { rect(i * 85, 60, 70, 100, ['#8a4a3a', '#6a5a4a', '#9a5a40'][i % 3]); poly([i * 85 - 4, 60, i * 85 + 35, 30, i * 85 + 74, 60], '#3a3a3a'); }
    ground(160, '#e8eef4', '#c8d0d8'); rect(140, 150, 120, 40, '#5a3a2a');
    person(200, 160, 80, { top: '#1a1a1a', coat: '#1a1a1a', hat: 'top', pose: 'armsUp', prop: undefined }); groundhog(201, 70 + wob(1), 0.9);
    for (let i = 0; i < 12; i++) person(i * 36, 300 - (i % 2) * 8, 80, { sil: '#2a2a3a', hat: i % 3 ? 'beret' : undefined });
    snow(14, 70);
  },
  () => { // the alarm clock flips to 6:00. Again.
    room('#d8c8a8', '#7a5a3a', 200, { stripes: ['rgba(255,255,255,0.12)', 30] });
    rr(110, 120, 180, 90, 10, '#3a2a1a'); rr(122, 132, 156, 66, 6, '#0a0a0a');
    rect(130, 140, 66, 50, '#1a1a1a'); rect(204, 140, 66, 50, '#1a1a1a'); txt('6', 163, 166, 40, '#f8f4e8', { font: 'Arial Black' }); txt('00', 237, 166, 40, '#f8f4e8', { font: 'Arial Black' }); line(130, 165, 270, 165, '#333', 1.5);
    txt('♪ I got you, bae ♪', 200, 240, 14, '#5a3a2a', { style: 'italic' });
  },
  () => { // the same first date at the same table, snow outside
    rect(0, 0, VW, VH, '#2a1810'); windowBox(130, 20, 140, 100, '#1a0c08', () => { sky('#2a3a5a', '#6a7a9a'); snow(5, 30); });
    glow(200, 200, 170, 'rgba(255,190,110,0.4)'); table(200, 200, 160, '#5a3a20', '#f0e8e0');
    rect(196, 178, 8, 22, '#f4f0e0'); poly([196, 178, 200, 166 - wob(2, 3), 204, 178], '#ffd060'); glow(200, 172, 24, 'rgba(255,220,120,0.6)');
    person(110, 260, 120, { top: '#5a4a3a', bottom: '#2a2a2a', pose: 'sit', hair: '#4a3020', smile: true }); person(290, 260, 120, { top: '#a03040', dress: true, pose: 'sit', facing: -1, hairStyle: 'long', hair: '#3a2010' });
  },
] };

ART['bite-club'] = { g: 'fightclub', p: 0, s: [
  () => { // the basement: one bulb, two vampires circling, a ring of watchers
    rect(0, 0, VW, VH, '#0a0a06'); line(200, 0, 200 + wob(3), 50, '#333', 1); circ(200 + wob(3), 54, 6, '#fffbe0'); glow(200 + wob(3), 54, 200, 'rgba(255,240,180,0.35)');
    ground(200, '#2a2a1a', '#1a1a0a'); ell(200, 250, 170, 30, 'rgba(255,240,180,0.08)');
    person(150, 270, 140, { top: '#d8d0c0', bottom: '#2a2a2a', skin: '#e8e8e0', hair: '#1a1a1a', pose: 'fight', cape: '#3a0a0a' });
    person(260, 270, 140, { top: '#2a2a2a', bottom: '#2a2a2a', skin: '#e0e0d8', hair: '#c8a050', hairStyle: 'spiky', pose: 'fight', facing: -1 });
    for (let i = 0; i < 10; i++) person(i * 44, 300, 110, { sil: '#050503' });
  },
  () => { // the mirror: fangs and dental floss
    rect(0, 0, VW, VH, '#2a2a1a'); rr(70, 20, 260, 220, 6, '#8a8a7a'); rr(80, 30, 240, 200, 4, '#4a4a3a');
    bust(200, 140, 1.5, { skin: '#e0e4d8', hair: '#1a1a1a', top: '#d8d0c0', mouth: 'grin', brow: 6, extra: () => { poly([-8, 15, -5, 26, -2, 15], '#fff'); poly([2, 15, 5, 26, 8, 15], '#fff'); } });
    line(150, 170, 250, 168 + wob(2), '#f4f4f4', 1.2); rect(0, 240, VW, 50, '#d8d0b8'); rr(260, 245, 30, 16, 3, '#e8a0b0');
  },
  () => { // the towers come down; two figures hold hands at the window
    sky('#2a2a3a', '#6a5a50'); for (let i = 0; i < 6; i++) { const x = 30 + i * 62, h0 = 150 + (i % 3) * 30, drop = (i === 2 || i === 4) ? 30 + M * 8 : 0; rect(x, 290 - h0 + drop, 46, h0, '#1a1a24'); for (let y = 290 - h0 + drop + 6; y < 280; y += 10) for (let k = 0; k < 4; k++) rect(x + 5 + k * 10, y, 5, 5, h2(x + k, y, 2) < 0.4 ? '#ffd890' : '#2a2a34'); if (drop) { for (let k = 0; k < 4; k++) circ(x + 10 + k * 10, 285, 14, 'rgba(180,170,150,0.5)'); glow(x + 23, 280 - h0 + drop, 40, 'rgba(255,140,40,0.6)'); } }
    rect(0, 0, VW, 30, '#000'); rect(0, 0, 20, VH, '#000'); rect(380, 0, 20, VH, '#000'); rect(0, 260, VW, 30, '#000');
    person(185, 280, 120, { sil: '#000', pose: [0.6, -0.1, 0, 0] }); person(215, 280, 115, { sil: '#000', hairStyle: 'long', pose: [0.1, -0.6, 0, 0] });
  },
  () => frameCard(['RULE #2:', 'FLOSSING.'], { size: 40, font: '"Arial Black", Impact, sans-serif', bg: '#0a0a06', fg: '#e8e0c8' }),
] };
// ---------------------------------------------------------------- colour grades
// sat: saturation, con: contrast, lift: black lift, tint: rgb multipliers, split: [shadow rgb, highlight rgb, amount],
// grain: noise amplitude, vig: vignette strength, flick: per-frame exposure flicker, dirt: scratches + dust (silent era)
const GRADES = {
  bw: { sat: 0, con: 1.18, tint: [1.0, 1.0, 1.0], grain: 22, vig: 0.6, flick: 0.04 },
  noir: { sat: 0, con: 1.35, tint: [0.96, 1.0, 1.06], grain: 20, vig: 0.85, flick: 0.03 },
  silent: { sat: 0, con: 1.25, tint: [1.1, 0.97, 0.78], grain: 30, vig: 0.85, flick: 0.12, dirt: 1 },
  silver: { sat: 0, con: 1.3, tint: [0.92, 0.98, 1.08], grain: 28, vig: 0.8, flick: 0.1, dirt: 0.7 },
  zone: { sat: 0.35, con: 1.1, tint: [1.08, 1.0, 0.8], grain: 22, vig: 0.7, flick: 0.03 },
  amelie: { sat: 1.35, con: 1.1, tint: [1.06, 1.04, 0.78], split: [[-10, 12, -6], [18, 6, -20], 1], grain: 12, vig: 0.6 },
  fifties: { sat: 1.15, con: 1.08, tint: [1.04, 1.0, 0.92], grain: 14, vig: 0.5, lift: 0.03 },
  wkw: { sat: 1.3, con: 1.15, tint: [1.08, 0.98, 0.86], split: [[6, -4, 8], [20, 8, -14], 1], grain: 18, vig: 0.75 },
  desert: { sat: 1.2, con: 1.06, tint: [1.08, 1.0, 0.88], grain: 14, vig: 0.45, lift: 0.02 },
  seventies: { sat: 0.85, con: 1.05, tint: [1.08, 1.0, 0.84], grain: 18, vig: 0.55, lift: 0.06 },
  amber: { sat: 0.9, con: 1.2, tint: [1.12, 0.98, 0.74], grain: 16, vig: 0.9 },
  techni: { sat: 1.4, con: 1.1, tint: [1.02, 1.0, 0.98], grain: 10, vig: 0.4 },
  warm: { sat: 1.15, con: 1.05, tint: [1.06, 1.0, 0.9], grain: 12, vig: 0.5, lift: 0.02 },
  eighties: { sat: 1.3, con: 1.1, tint: [1.02, 0.98, 1.04], split: [[4, -6, 18], [14, 4, -6], 1], grain: 14, vig: 0.5 },
  matrix: { sat: 0.55, con: 1.2, tint: [0.78, 1.12, 0.78], grain: 12, vig: 0.6 },
  savanna: { sat: 1.35, con: 1.1, tint: [1.08, 1.0, 0.86], grain: 8, vig: 0.4 },
  teal: { sat: 1.15, con: 1.12, split: [[-18, 6, 22], [24, 8, -20], 1], grain: 10, vig: 0.5 },
  adventure: { sat: 1.1, con: 1.12, tint: [1.08, 1.0, 0.82], grain: 14, vig: 0.65 },
  steel: { sat: 0.7, con: 1.2, tint: [0.86, 0.96, 1.14], grain: 14, vig: 0.7 },
  bright: { sat: 1.3, con: 1.04, grain: 8, vig: 0.3 },
  fury: { sat: 1.5, con: 1.15, split: [[-14, 6, 20], [28, 6, -24], 1], grain: 10, vig: 0.55 },
  cold: { sat: 0.6, con: 1.15, tint: [0.92, 0.98, 1.06], grain: 16, vig: 0.7 },
  napalm: { sat: 1.3, con: 1.15, tint: [1.12, 0.96, 0.76], grain: 16, vig: 0.65 },
  cyber: { sat: 1.3, con: 1.15, split: [[4, -4, 22], [20, 0, 10], 1], grain: 14, vig: 0.7 },
  overlook: { sat: 1.1, con: 1.08, tint: [1.0, 1.0, 1.02], grain: 12, vig: 0.55 },
  space: { sat: 1.1, con: 1.15, grain: 10, vig: 0.5 },
  midnight: { sat: 1.4, con: 1.2, grain: 18, vig: 0.75, flick: 0.04 },
  fightclub: { sat: 0.7, con: 1.2, tint: [1.0, 1.04, 0.84], split: [[-6, 6, -4], [12, 10, -10], 1], grain: 22, vig: 0.85, flick: 0.03 },
  leader: { sat: 0, con: 1.1, grain: 18, vig: 0.35, flick: 0.04 },
  natural: { sat: 1.1, con: 1.05, grain: 10, vig: 0.45 },
  paper: { sat: 1.0, con: 1.0, grain: 8, vig: 0.25 },
};

function applyGrade(sc, w, h, gname, seed) {
  const g = GRADES[gname] || GRADES.natural;
  let img;
  try { img = sc.getImageData(0, 0, w, h); } catch (e) { return; }
  const d = img.data;
  const sat = g.sat ?? 1, con = g.con ?? 1, lift = (g.lift ?? 0) * 255, tint = g.tint || [1, 1, 1];
  const split = g.split, grain = (g.grain ?? 10) * Math.min(1.3, Math.max(0.6, w / 400)), vig = g.vig ?? 0.4;
  const flick = 1 + (g.flick || 0) * (h2(seed, 1, 7) - 0.5) * 2;
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) / cy, dy2 = dy * dy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = d[i], gg = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (sat !== 1) { r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat; }
      if (con !== 1) { r = (r - 128) * con + 128; gg = (gg - 128) * con + 128; b = (b - 128) * con + 128; }
      if (split) { const t = l / 255, a = split[2]; r += (split[0][0] * (1 - t) + split[1][0] * t) * a; gg += (split[0][1] * (1 - t) + split[1][1] * t) * a; b += (split[0][2] * (1 - t) + split[1][2] * t) * a; }
      r *= tint[0]; gg *= tint[1]; b *= tint[2];
      if (lift) { r = r * (1 - lift / 255) + lift; gg = gg * (1 - lift / 255) + lift; b = b * (1 - lift / 255) + lift; }
      const dx = (x - cx) / cx, v = dx * dx + dy2;
      const f = flick * (1 - vig * Math.max(0, v * 0.55 - 0.12));
      const n = (h2(x, y, seed) - 0.5) * grain;
      d[i] = r * f + n; d[i + 1] = gg * f + n; d[i + 2] = b * f + n;
    }
  }
  sc.putImageData(img, 0, 0);
}

function dirt(amount, seed) {
  const r = seeded(seed);
  const n = Math.floor(r() * 3 * amount);
  for (let i = 0; i < n; i++) { const x = r() * VW; line(x, 0, x + (r() - 0.5) * 6, VH, `rgba(255,255,240,${0.15 + r() * 0.25})`, 0.6 + r()); }
  for (let i = 0; i < 6 * amount; i++) circ(r() * VW, r() * VH, 0.5 + r() * 1.6, r() < 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,240,0.5)');
  if (r() < 0.25 * amount) { const x = r() * VW, y = r() * VH; pline([x, y, x + 8, y + 3, x + 12, y + 10, x + 10, y + 16], 'rgba(0,0,0,0.5)', 1); }
}

function resetCtx(sc) {
  sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over'; sc.shadowBlur = 0; sc.shadowColor = 'rgba(0,0,0,0)';
  sc.setLineDash && sc.setLineDash([]); sc.lineCap = 'butt'; sc.lineJoin = 'miter'; sc.filter = 'none';
}

// paint into a scratch canvas in virtual coords, grade, then blit onto the caller's context
function render(ctx, w, h, key, gname, seed, fn, o = {}) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const cv = scratch(w, h, key);
  const sc = cv.getContext('2d', { willReadFrequently: true });
  resetCtx(sc); sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, w, h); sc.fillStyle = '#000'; sc.fillRect(0, 0, w, h);
  sc.setTransform(w / (o.vw || VW), 0, 0, h / (o.vh || VH), 0, 0);
  const prev = c, prevM = M, prevR = rng;
  c = sc;
  try { fn(); } catch (e) { console.warn('[frames] paint failed', key, e); }
  if (GRADES[gname]?.dirt) dirt(GRADES[gname].dirt, seed);
  sc.setTransform(1, 0, 0, 1, 0, 0); resetCtx(sc);
  if (gname) applyGrade(sc, w, h, gname, seed);
  c = prev; M = prevM; rng = prevR;
  ctx.drawImage(cv, 0, 0, w, h);
}

// ---------------------------------------------------------------- public: shots
export function filmArt(filmId) { return ART[filmId] || null; }
export const SHOT_W = VW, SHOT_H = VH;

export function paintShot(ctx, filmId, shot, w, h, t = 0) {
  const art = ART[filmId];
  const film = FILM_BY_ID[filmId];
  const n = art ? art.s.length : 3;
  const k = ((shot % n) + n) % n;
  const seed = hashStr(filmId + ':' + k) + Math.floor((t % 1) * 997);
  render(ctx, w, h, 'shot', art ? art.g : 'natural', seed, () => {
    M = ((t % 1) + 1) % 1; rng = seeded(hashStr(filmId + '#' + k));
    if (art) art.s[k]();
    else fallbackShot(film ? film.title : filmId, k);
  });
}

function fallbackShot(title, k) {
  const r = seeded(hashStr(title + k));
  sky(`hsl(${r() * 360},50%,40%)`, `hsl(${r() * 360},50%,75%)`, 200); hills(200, 30, `hsl(${r() * 360},30%,30%)`, k + 1);
  person(200 + M * 4, 270, 90, { top: `hsl(${r() * 360},50%,45%)`, pose: 'walk' });
  txt(title, 200, 40, 18, '#fff', { shadow: '#000' });
}

// ---------------------------------------------------------------- public: leaders
export function paintLeader(ctx, kind, n, w, h) {
  const seed = hashStr('leader' + kind) + Math.floor((n || 0) * 131);
  render(ctx, w, h, 'leader', kind === 'black' ? null : 'leader', seed, () => {
    M = 0; rng = seeded(seed);
    if (kind === 'countdown') countdown(n);
    else if (kind === 'start') startFrame();
    else if (kind === 'head' || kind === 'tail') leaderText(kind, n);
    else { rect(0, 0, VW, VH, '#050505'); const r = seeded(seed); for (let i = 0; i < 5; i++) circ(r() * VW, r() * VH, 0.6 + r() * 1.2, 'rgba(255,255,255,0.35)'); }
  });
}

function countdown(n) {
  const v = Math.max(2, Math.min(8, n ?? 8));
  const d = Math.max(2, Math.min(8, Math.ceil(v - 1e-6)));
  const sweep = Math.max(0, Math.min(1, d - v));
  const cx = VW / 2, cy = VH / 2;
  rect(0, 0, VW, VH, '#a8a8a8');
  if (sweep > 0) { c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 400, -Math.PI / 2, -Math.PI / 2 + sweep * TAU); c.closePath(); c.fillStyle = '#4c4c4c'; c.fill(); }
  line(0, cy, VW, cy, '#1a1a1a', 2); line(cx, 0, cx, VH, '#1a1a1a', 2);
  ring(cx, cy, 118, '#f4f4f4', 5); ring(cx, cy, 100, '#f4f4f4', 4);
  if (sweep > 0) { const a = -Math.PI / 2 + sweep * TAU; line(cx, cy, cx + Math.cos(a) * 400, cy + Math.sin(a) * 400, '#111', 2.5); }
  txt(String(d), cx, cy + 6, 150, '#111', { font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 'bold' });
  rect(8, 8, 46, 12, '#444'); txt('SMPTE', 31, 14.5, 8, '#ddd', { font: 'Arial' });
}
function startFrame() {
  rect(0, 0, VW, VH, '#b8b8b8'); c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(30, 26, VW - 60, VH - 52);
  line(30, VH / 2, VW - 30, VH / 2, '#111', 2); line(VW / 2, 26, VW / 2, VH - 26, '#111', 2);
  rect(70, 92, 260, 106, '#b8b8b8');
  txt('PICTURE', VW / 2, 122, 40, '#111', { font: '"Arial Black", Impact, sans-serif' });
  txt('START', VW / 2, 170, 48, '#111', { font: '"Arial Black", Impact, sans-serif' });
  poly([VW / 2 - 14, 228, VW / 2 + 14, 228, VW / 2, 252], '#111');
}
function leaderText(kind, n) {
  const head = kind === 'head';
  rect(0, 0, VW, VH, head ? '#1a1a1a' : '#262626');
  c.strokeStyle = '#e8e8e8'; c.lineWidth = 3; c.strokeRect(24, 22, VW - 48, VH - 44);
  txt(head ? 'HEAD' : 'TAIL', VW / 2, 92, 64, '#f0f0f0', { font: '"Arial Black", Impact, sans-serif', spacing: 6 });
  txt(`REEL  ${n ?? 1}`, VW / 2, 162, 40, '#f0f0f0', { font: '"Arial Black", Impact, sans-serif', spacing: 4 });
  txt(head ? 'PAPER STREET FILM EXCHANGE' : 'END OF REEL · RUN-OUT', VW / 2, 214, 15, '#c8c8c8', { font: 'Arial, sans-serif', spacing: 2 });
  txt('35MM · 1.37:1 · 24 FPS', VW / 2, 240, 11, '#999', { font: 'Arial, sans-serif', spacing: 2 });
  if (!head) { poly([VW / 2 - 12, 40, VW / 2 + 12, 40, VW / 2, 24 + 4], '#f0f0f0'); }
}

// ---------------------------------------------------------------- public: cue mark
// The "cigarette burn": a round mark scratched into the emulsion, top-right of the picture.
export function paintCue(ctx, w, h) {
  const cx = w * 0.865, cy = h * 0.15, r = Math.max(3, h * 0.058);
  ctx.save();
  const g1 = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.9);
  g1.addColorStop(0, 'rgba(255,250,235,0.55)'); g1.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, r * 1.9, 0, TAU); ctx.fill();
  const rr2 = seeded(1234);
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, k = r * (0.94 + rr2() * 0.12); i ? ctx.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k) : ctx.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
  ctx.closePath();
  ctx.fillStyle = '#16120e'; ctx.fill();
  const g2 = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r * 0.82);
  g2.addColorStop(0, '#fffef6'); g2.addColorStop(0.75, '#f4ecd8'); g2.addColorStop(1, 'rgba(240,225,200,0.9)');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- public: mischief frames
const MISCHIEF = {
  soap: () => {
    rect(0, 0, VW, VH, '#1a1418'); glow(200, 150, 220, 'rgba(255,200,220,0.35)');
    ell(200, 205, 120, 18, 'rgba(0,0,0,0.5)');
    rr(90, 100, 220, 100, 40, '#e8a0b4'); rr(98, 106, 204, 84, 34, '#f4b8c8'); ell(170, 120, 60, 10, 'rgba(255,255,255,0.4)');
    txt('PAPER STREET', 200, 138, 22, '#c07890', { font: '"Palatino Linotype", Georgia, serif', weight: 'bold', spacing: 2 });
    txt('SOAP CO.', 200, 166, 18, '#c07890', { font: '"Palatino Linotype", Georgia, serif', weight: 'bold', spacing: 4 });
    for (let i = 0; i < 14; i++) { const r2 = seeded(i + 5); const x = 60 + r2() * 280, y = 30 + r2() * 90, s = 4 + r2() * 12; ring(x, y, s, 'rgba(255,240,250,0.6)', 1.2); circ(x - s * 0.3, y - s * 0.3, s * 0.2, 'rgba(255,255,255,0.6)'); }
  },
  penguin: () => {
    sky('#9ad0f0', '#e8f6ff', 170); mountains(170, 60, '#d8eef8', 4, 4, '#ffffff');
    ground(170, '#e8f4fc', '#b8d8ec'); for (let i = 0; i < 6; i++) line(0, 200 + i * 14, VW, 196 + i * 16, 'rgba(255,255,255,0.7)', 1);
    penguin(220, 236, 2.6, { slide: true }); for (let i = 0; i < 6; i++) line(140 - i * 18, 238 + i, 170 - i * 18, 238 + i, 'rgba(120,170,200,0.6)', 2);
    txt('Slide.', 330, 60, 30, '#2a4a6a', { style: 'italic' });
  },
  ducky: () => {
    rect(0, 0, VW, VH, '#e8f0f0'); for (let x = 0; x < VW; x += 40) for (let y = 0; y < 150; y += 40) { c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 1.5; c.strokeRect(x, y, 40, 40); }
    sea(150, '#a8d8e8', '#6ab0d0', 'rgba(255,255,255,0.6)', 14);
    duck(200, 170, 3.2); ell(200, 176, 90, 10, 'rgba(255,255,255,0.4)');
    for (let i = 0; i < 20; i++) { const r2 = seeded(i + 77); const x = r2() * VW, y = 150 + r2() * 130, s = 4 + r2() * 10; circ(x, y, s, 'rgba(255,255,255,0.75)'); }
  },
  'tyler-wink': () => {
    rect(0, 0, VW, VH, '#2a2a18'); glow(200, 120, 220, 'rgba(255,230,160,0.35)');
    bust(200, 140, 2.0, { skin: '#eacaa8', hair: '#e8c870', hairStyle: 'spiky', top: '#8a1a14', collar: '#5a0a08', wink: true, mouth: 'grin', brow: 6 });
    txt('— hi.', 330, 250, 16, '#e8e0c0', { style: 'italic' });
  },
  'rule-card': () => frameCard(['You do not talk', 'about the booth.'], { size: 30, font: '"Palatino Linotype", Georgia, serif', italic: true }),
  cat: () => {
    rect(0, 0, VW, VH, '#3a3028'); glow(200, 150, 200, 'rgba(255,220,180,0.3)');
    at(200, 300, 1, 1, () => {
      ell(0, -40, 150, 90, '#8a8078'); circ(0, -150, 95, '#9a9088');
      poly([-80, -190, -70, -270, -20, -220], '#9a9088'); poly([80, -190, 70, -270, 20, -220], '#9a9088'); poly([-70, -200, -64, -250, -36, -222], '#e0a8a8'); poly([70, -200, 64, -250, 36, -222], '#e0a8a8');
      for (let i = 0; i < 3; i++) { line(-30, -165 + i * 8, -60, -170 + i * 6, '#6a6058', 4); line(30, -165 + i * 8, 60, -170 + i * 6, '#6a6058', 4); }
      ell(-36, -165, 22, 26, '#c8d050'); ell(36, -165, 22, 26, '#c8d050'); ell(-36, -165, 7, 22, '#111'); ell(36, -165, 7, 22, '#111'); circ(-30, -174, 5, '#fff'); circ(42, -174, 5, '#fff');
      poly([-10, -128, 10, -128, 0, -118], '#d08080'); pline([0, -118, -10, -108, -20, -110], '#5a4a40', 2); pline([0, -118, 10, -108, 20, -110], '#5a4a40', 2);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(s * 30, -118 + i * 6, s * 120, -128 + i * 14, 'rgba(255,255,255,0.7)', 1);
    });
  },
};
export function paintMischief(ctx, id, w, h) {
  const seed = hashStr('mischief' + id);
  render(ctx, w, h, 'mischief', id === 'rule-card' ? 'silent' : 'natural', seed, () => { M = 0; rng = seeded(seed); (MISCHIEF[id] || MISCHIEF.soap)(); });
}

// ---------------------------------------------------------------- public: posters
const CREDIT_NAMES = ['ROBERT PAULSEN', 'MARLA SINGER', 'CORNELIUS', 'RUPERT', 'LOU', 'CHLOE', 'JACK', 'RAYMOND K. HESSEL', 'RICHARD CHESLER', 'ANGEL FACE', 'BOB', 'IKEA NESTER', 'THOMAS', 'RICKY', 'DETECTIVE STERN', 'THE MECHANIC'];
const POSTER_STYLE = {
  silent: { layout: 'deco', font: '"Copperplate Gothic Bold", "Palatino Linotype", Georgia, serif', bg: '#121010', ink: '#e8d8a8', accent: '#c8a050' },
  silver: { layout: 'deco', font: '"Copperplate Gothic Bold", "Arial Black", sans-serif', bg: '#101418', ink: '#e8e8f0', accent: '#a8b0c0' },
  bw: { layout: 'criterion', font: '"Bodoni MT", Didot, "Palatino Linotype", Georgia, serif', bg: '#efe9dc', ink: '#161616', accent: '#a01818' },
  noir: { layout: 'criterion', font: '"Bodoni MT", Didot, Georgia, serif', bg: '#141414', ink: '#f0f0f0', accent: '#c8a050' },
  amelie: { layout: 'criterion', font: '"Palatino Linotype", Georgia, serif', bg: '#2a4a20', ink: '#f8e8b0', accent: '#d02818', italic: true },
  fifties: { layout: 'saul', font: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif', bg: '#e8a020', ink: '#1a1a1a', accent: '#c01818' },
  zone: { layout: 'criterion', font: '"Courier New", monospace', bg: '#3a3a2a', ink: '#e8e0b8', accent: '#8aaa5a' },
  wkw: { layout: 'criterion', font: '"Palatino Linotype", Georgia, serif', bg: '#5a0a0a', ink: '#f8d8a0', accent: '#e8c060', italic: true },
  desert: { layout: 'saul', font: '"Rockwell", "Courier New", serif', bg: '#c8401a', ink: '#f8e8c8', accent: '#1a1a1a' },
};
function posterStyle(film, art) {
  const g = art ? art.g : 'natural';
  if (POSTER_STYLE[g]) return POSTER_STYLE[g];
  if (film.kind === 'blockbuster') {
    const fonts = { eighties: '"Arial Black", Impact', matrix: '"Consolas", "Courier New", monospace', techni: 'Impact, "Arial Black", sans-serif', teal: '"Arial Black", Impact', savanna: '"Trebuchet MS", "Arial Black", sans-serif', amber: '"Bodoni MT", Didot, Georgia, serif', steel: '"Arial Black", Impact', fury: 'Impact, "Arial Black"', napalm: '"Copperplate Gothic Bold", Impact', adventure: '"Rockwell", Impact, serif', cold: '"Bodoni MT", Georgia, serif', warm: '"Trebuchet MS", Georgia, serif', seventies: '"Rockwell", Impact, serif', bright: '"Trebuchet MS", "Arial Black"' };
    return { layout: 'blockbuster', font: fonts[g] || 'Impact, "Arial Black", sans-serif', ink: '#ffffff', accent: '#ffd040', chrome: g === 'eighties' || g === 'steel' };
  }
  const cults = { cyber: ['#0a0a14', '#ff4ab0'], seventies: ['#e8b030', '#c01818'], overlook: ['#e8e0d0', '#a01010'], space: ['#000000', '#ffffff'], midnight: ['#0a0004', '#e00a1a'], warm: ['#f0d8b0', '#2a5a9a'], fightclub: ['#e8e0c8', '#a01818'] };
  const cc = cults[g] || ['#1a1a1a', '#ffd040'];
  return { layout: hashStr(film.id) % 3 === 0 ? 'saul' : 'cult', font: g === 'space' ? '"Century Gothic", "Futura", "Trebuchet MS", sans-serif' : g === 'cyber' ? '"Arial Black", Impact' : g === 'overlook' ? '"Arial Black", Impact' : '"Cooper Black", "Arial Black", Impact, serif', bg: cc[0], ink: cc[1], accent: cc[1] };
}

function wrapText(s, maxW, size, font) {
  c.font = `${size}px ${font}`;
  const words = s.split(' '); const lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function fitTitle(s, maxW, size, font, minSize = 10) {
  c.font = `${size}px ${font}`; let sz = size;
  while (sz > minSize && c.measureText(s).width > maxW) { sz -= 1; c.font = `${sz}px ${font}`; }
  return sz;
}
function titleBlock(title, x, y, maxW, size, st, o = {}) {
  // returns height used. Splits long titles onto two lines.
  const font = st.font, up = o.upper !== false;
  const t = up ? title.toUpperCase() : title;
  let lines = [t];
  if (t.length > 14 && t.includes(' ')) { const words = t.split(' '); const mid = Math.ceil(words.length / 2); lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]; if (t.includes(':')) lines = t.split(/:\s*/).map((l, i) => i === 0 ? l + ':' : l); }
  let used = 0;
  lines.forEach((l, i) => {
    const sz = fitTitle(l, maxW, size * (i > 0 && lines.length > 1 && l.length < lines[0].length * 0.6 ? 0.8 : 1), font);
    const yy = y + used + sz * 0.5;
    const style = st.italic ? 'italic' : '';
    if (st.chrome) {
      c.save(); c.font = `${style} ${sz}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = Math.max(2, sz * 0.12); c.strokeStyle = '#1a0a2a'; c.strokeText(l, x, yy, maxW);
      c.fillStyle = lg(0, yy - sz / 2, 0, yy + sz / 2, ['#ffffff', '#a8c8ff', '#2a3a6a', '#ffc8f0', '#ffffff']); c.fillText(l, x, yy, maxW); c.restore();
    } else if (o.shadow) {
      txt(l, x + sz * 0.06, yy + sz * 0.06, sz, o.shadow, { font, style, max: maxW });
      txt(l, x, yy, sz, st.ink, { font, style, max: maxW, stroke: o.stroke, lw: sz * 0.08 });
    } else txt(l, x, yy, sz, st.ink, { font, style, max: maxW, stroke: o.stroke, lw: sz * 0.08 });
    used += sz * 1.02;
  });
  return used;
}
function billing(film, x, y, w, col, size) {
  const r = seeded(hashStr(film.id + 'bill'));
  const pick = () => CREDIT_NAMES[Math.floor(r() * CREDIT_NAMES.length)];
  const a = pick(), b = pick(), d = pick();
  const lines = [
    `PAPER STREET PICTURES presents  a MAYHEM FILMS production  ${a}  ${b}`,
    `"${film.title.toUpperCase()}"  music by THE SPACE MONKEYS  edited by TYLER  in a single frame`,
    `produced by ${d}  written and directed by NOBODY YOU KNOW  © PAPER STREET`,
  ];
  lines.forEach((l, i) => txt(l, x, y + i * size * 1.25, size, col, { font: '"Arial Narrow", "Franklin Gothic Medium", Arial, sans-serif', max: w }));
}

export function paintPoster(ctx, film, w, h) {
  if (typeof film === 'string') film = FILM_BY_ID[film];
  if (!film) return;
  const art = ART[film.id];
  const st = posterStyle(film, art);
  const PW = 200, PH = 300;
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  // key art first, at a decent resolution
  const keyShot = art ? art.p : 0;
  const artW = Math.max(160, Math.round(w * 1.1)), artH = Math.round(artW * VH / VW);
  const artCv = scratch(artW, artH, 'poster-art');
  const actx = artCv.getContext('2d', { willReadFrequently: true });
  paintShot(actx, film.id, keyShot, artW, artH, 0.37);
  const seed = hashStr(film.id + 'poster');
  render(ctx, w, h, 'poster', 'paper', seed, () => {
    rng = seeded(seed); M = 0;
    const drawArt = (x, y, ww, hh) => { // cover-crop
      const ar = artW / artH, br = ww / hh; let sw = artW, sh = artH, sx = 0, sy = 0;
      if (br < ar) { sw = artH * br; sx = (artW - sw) / 2; } else { sh = artW / br; sy = (artH - sh) / 2; }
      c.drawImage(artCv, sx, sy, sw, sh, x, y, ww, hh);
    };
    const tagFont = '"Palatino Linotype", Georgia, serif';
    if (st.layout === 'blockbuster') {
      drawArt(0, 0, PW, PH);
      c.fillStyle = lg(0, 150, 0, PH, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']); c.fillRect(0, 150, PW, PH - 150);
      c.fillStyle = lg(0, 0, 0, 50, ['rgba(0,0,0,0.65)', 'rgba(0,0,0,0)']); c.fillRect(0, 0, PW, 50);
      wrapText(film.tagline, 170, 8, tagFont).slice(0, 2).forEach((l, i) => txt(l.toUpperCase(), PW / 2, 13 + i * 10, 7, '#f0f0f0', { font: '"Arial Narrow", Arial, sans-serif', spacing: 1 }));
      const ty0 = film.title.length > 14 && film.title.includes(' ') ? 170 : 200;
      const used = titleBlock(film.title, PW / 2, ty0, 184, 40, st, { shadow: 'rgba(0,0,0,0.6)', stroke: st.chrome ? undefined : 'rgba(0,0,0,0.35)' });
      txt(['THIS SUMMER', 'COMING SOON', 'NOW SHOWING', 'HELD OVER!', 'ONLY IN THEATRES', 'THIS CHRISTMAS'][hashStr(film.id) % 6], PW / 2, ty0 + used + 7, 8, st.accent, { font: '"Arial Black", Impact', spacing: 3 });
      billing(film, PW / 2, 262, 186, 'rgba(255,255,255,0.75)', 4.3);
      rect(12, 284, 20, 10, '#fff'); txt('PG-13', 22, 289.5, 5.5, '#000', { font: 'Arial Black' }); txt('IN 35MM AT THE PAPER STREET PICTURE HOUSE', 116, 289.5, 5, '#ddd', { font: 'Arial', max: 160 });
    } else if (st.layout === 'deco') {
      rect(0, 0, PW, PH, st.bg);
      c.strokeStyle = st.accent; c.lineWidth = 2; c.strokeRect(8, 8, PW - 16, PH - 16); c.lineWidth = 0.8; c.strokeRect(13, 13, PW - 26, PH - 26);
      for (let i = 0; i < 9; i++) { line(PW / 2, 26, PW / 2 + (i - 4) * 22, 6, st.accent, 0.8); }
      c.save(); c.beginPath(); c.moveTo(28, 210); c.lineTo(28, 80); c.arc(PW / 2, 80, PW / 2 - 28, Math.PI, 0); c.lineTo(PW - 28, 210); c.closePath(); c.clip(); drawArt(28, 28, PW - 56, 182); c.restore();
      c.beginPath(); c.moveTo(28, 210); c.lineTo(28, 80); c.arc(PW / 2, 80, PW / 2 - 28, Math.PI, 0); c.lineTo(PW - 28, 210); c.strokeStyle = st.accent; c.lineWidth = 2; c.stroke();
      const usedD = titleBlock(film.title, PW / 2, 216, 160, 30, st, {});
      wrapText(film.tagline, 160, 7, tagFont).slice(0, 2).forEach((l, i) => txt(l, PW / 2, Math.min(268, 222 + usedD) + i * 9, 7, st.ink, { font: tagFont, style: 'italic' }));
      billing(film, PW / 2, 282, 170, st.accent, 3.6);
    } else if (st.layout === 'saul') {
      rect(0, 0, PW, PH, st.bg);
      c.save(); c.translate(PW / 2, 120); c.rotate(-0.08); c.beginPath(); c.rect(-78, -80, 156, 150); c.clip(); drawArt(-78, -80, 156, 150); c.restore();
      c.save(); c.translate(PW / 2, 120); c.rotate(-0.08); c.strokeStyle = st.accent; c.lineWidth = 4; c.strokeRect(-78, -80, 156, 150); c.restore();
      for (let i = 0; i < 5; i++) rect(14 + i * 6, 20 + i * 18, 3, 26, st.accent);
      const usedS = titleBlock(film.title, PW / 2, 206, 178, 32, st, {});
      wrapText(film.tagline, 170, 7.5, tagFont).slice(0, 2).forEach((l, i) => txt(l, PW / 2, Math.min(262, 214 + usedS) + i * 9.5, 7.5, st.ink, { font: tagFont, style: 'italic' }));
      billing(film, PW / 2, 281, 176, st.ink, 3.6);
    } else if (st.layout === 'cult') {
      rect(0, 0, PW, PH, st.bg);
      const r2 = seeded(seed + 3); for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; alpha(0.12, () => cone(PW / 2, 110, a, 0.08, 260, st.accent)); }
      c.save(); c.beginPath(); c.arc(PW / 2, 112, 78, 0, TAU); c.clip(); drawArt(PW / 2 - 104, 34, 208, 156); c.restore();
      ring(PW / 2, 112, 78, st.accent, 4); ring(PW / 2, 112, 84, st.accent, 1);
      const used = titleBlock(film.title, PW / 2, 200, 182, 34, st, { shadow: st.bg === '#000000' ? '#333' : 'rgba(0,0,0,0.35)' });
      wrapText(film.tagline, 170, 7.5, tagFont).slice(0, 2).forEach((l, i) => txt(l, PW / 2, 206 + used + 8 + i * 9.5, 7.5, st.ink, { font: tagFont, style: 'italic' }));
      txt('A MIDNIGHT MOVIE', PW / 2, 12, 7, st.ink, { font: '"Arial Black", Impact', spacing: 3 });
      billing(film, PW / 2, 280, 180, st.ink, 3.6); void r2;
    } else { // criterion
      rect(0, 0, PW, PH, st.bg);
      rect(16, 16, PW - 32, 168, st.ink); drawArt(18, 18, PW - 36, 164);
      txt((film.genre || '').toUpperCase(), PW / 2, 196, 6.5, st.accent, { font: 'Arial, sans-serif', spacing: 3 });
      const used = titleBlock(film.title, PW / 2, 204, 170, 28, st, { upper: false });
      wrapText(film.tagline, 160, 7.5, tagFont).slice(0, 3).forEach((l, i) => txt(l, PW / 2, 210 + used + 8 + i * 9.5, 7.5, st.ink, { font: tagFont, style: 'italic' }));
      line(60, 270, 140, 270, st.accent, 0.8);
      billing(film, PW / 2, 279, 176, st.ink, 3.5);
    }
  }, { vw: PW, vh: PH });
}

export { FILMS };
