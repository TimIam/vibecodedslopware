// Medic 14: the Type III box ambulance (exterior, cab, lights). Tuning: dimensions in AMB, flash patterns in EMERGENCY.

import * as THREE from 'three';
import { U, patchWet, glowTexture } from './gfx.js';
import { makeRng, clamp, lerp, smooth, makeCanvas, canvasTex, TAU, fbm2 } from './util.js';
import {
  lin, g3, rad, curve, stations, range, archY, archStations, skin, SK, surf, lens, LENS, expandSection,
  mirrorRing, Builder, _m, _e, _v, faceMatrix, GLSL_WATER, WATER_VS, WATER_FS_NORMAL, makeSurfMat, makePaintMat,
  makeGlassMat, makeGlow, glowGeo, wheelInto, makeWheel, FONT, C_RED, C_GOLD, decalSheet, SK_DECAL, SK_CAB,
  SK_MDT, LAMP_N, E_RED, E_WHT, E_AMB, E_COOL, burst, SK_DGLASS, SK_SEAT, SK_GOLD, SK_PWHITE, E_BLUE, wheelGeo,
  _phMat, gearMat, groupOf, FX, withFx,
} from './vehicles-kit.js';


// ---------------------------------------------------------------------------------------------- ambulance: livery

// Type III box ambulance on a cutaway van chassis. All positions in metres in the vehicle frame.
const AMB = {
  zF: 2.0, zR: -2.0, R: 0.385, tyreW: 0.235, rimR: 0.212, trackF: 0.885, dualOut: 1.02, dualGap: 0.3,
  cabW: 1.0, cabBack: 0.54, nose: 2.74, sill: 0.42, belt: 1.42, archF: 0.48,
  modW: 1.2, modF: 0.5, modR: -4.15, modB: 0.42, modT: 2.70, archR: 0.52, floor: 0.85, tail: -4.45,
  // compartment doors per side [z front, z rear, y bottom, y top]; side door and windows
  compL: [[0.40, -0.25, 0.52, 2.25], [-0.33, -1.42, 0.52, 1.40], [-2.62, -3.98, 0.52, 2.25]],
  compR: [[-0.46, -1.42, 0.52, 1.40], [-2.62, -3.98, 0.52, 2.25]],
  sideDoor: [0.40, -0.38, 0.52, 2.42], sideWin: [0.27, -0.25], fixedWin: [-0.75, -1.95], winY: [1.62, 2.20],
  rearDoor: { x: 0.66, y0: 0.87, y1: 2.45 }, cabDoor: [1.88, 0.80],
};
// Paint atlas: five planar charts (0 left, 1 right, 2 front, 3 rear, 4 top), drawn in centimetres.
const AT = { W: 4096, H: 2048, z0: -4.5, z1: 2.9, y1: 2.96, xh: 1.25, rect: [[0, 0, 2560, 1024], [0, 1024, 2560, 1024], [2560, 0, 768, 1024], [2560, 1024, 768, 1024], [3328, 0, 768, 2048]], cm: [[740, 296], [740, 296], [250, 296], [250, 296], [250, 740]] };
function ambChart(ch, x, y, z) {
  const r = AT.rect[ch], v0 = (AT.y1 - y) / AT.y1; let u, v = v0;
  if (ch === 0) u = (AT.z1 - z) / 7.4; else if (ch === 1) u = (z - AT.z0) / 7.4; else if (ch === 2) u = (x + AT.xh) / 2.5; else if (ch === 3) u = (AT.xh - x) / 2.5; else { u = (AT.xh - x) / 2.5; v = (AT.z1 - z) / 7.4; }
  return [(r[0] + clamp(u, 0.003, 0.997) * r[2]) / AT.W, 1 - (r[1] + clamp(v, 0.003, 0.997) * r[3]) / AT.H];
}


// Original county mark: a heartbeat trace inside a double ring.
function drawEmblem(c, cx, cy, r, bg = '#dbdad6') {
  c.save(); c.translate(cx, cy);
  c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.strokeStyle = C_RED; c.lineWidth = r * 0.14; c.beginPath(); c.arc(0, 0, r * 0.92, 0, TAU); c.stroke();
  c.strokeStyle = C_GOLD; c.lineWidth = r * 0.045; c.beginPath(); c.arc(0, 0, r * 0.76, 0, TAU); c.stroke();
  const tr = [[-1, 0], [-0.56, 0], [-0.46, -0.13], [-0.36, 0], [-0.24, 0], [-0.15, 0.2], [-0.04, -0.86], [0.08, 0.5], [0.16, 0], [0.3, 0], [0.43, -0.22], [0.56, 0], [1, 0]];
  c.strokeStyle = C_RED; c.lineWidth = r * 0.085; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
  tr.forEach((p, i) => { const x = p[0] * r * 0.62, y = p[1] * r * 0.5; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
  c.restore();
}

// Draws the paint atlas. hm = false: colours (livery, lettering, shut lines, baked soft shading). hm = true: the same
// layout as a height field (mid grey = sheet level, black = panel gaps, white = rivet heads, slow blobs = the slight
// waviness of welded aluminium sheet), which becomes the normal map.
function drawAmbLivery(S, hm = false, seed = 14) {
  const cv = makeCanvas(AT.W * S, AT.H * S), c = cv.getContext('2d'), rng = makeRng(seed + 77);
  c.fillStyle = hm ? '#808080' : '#dbdad6'; c.fillRect(0, 0, cv.width, cv.height);
  const chart = (ch, fn) => { const r = AT.rect[ch]; c.save(); c.beginPath(); c.rect(r[0] * S, r[1] * S, r[2] * S, r[3] * S); c.clip(); c.setTransform(r[2] * S / AT.cm[ch][0], 0, 0, r[3] * S / AT.cm[ch][1], r[0] * S, r[1] * S); fn(); c.restore(); };
  const yy = y => (AT.y1 - y) * 100, SEAM = 'rgba(16,16,20,0.9)';
  const text = (s, x, y, px, col, sp = 0, w = 700) => { if (hm) return; c.font = FONT(px, w); c.letterSpacing = sp + 'px'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = col; c.fillText(s, x, y); c.letterSpacing = '0px'; };
  // a panel gap along the current path: dark line (+ a light catch on the lower lip) in colour, a soft-shouldered groove in height
  const gap = (w = 0.8) => { if (hm) { c.lineJoin = 'round'; c.strokeStyle = '#5a5a5a'; c.lineWidth = w * 2.6; c.stroke(); c.strokeStyle = '#000'; c.lineWidth = w * 1.3; c.stroke(); } else { c.strokeStyle = SEAM; c.lineWidth = w * 0.75; c.stroke(); } };
  const rivets = (x0, y0, x1, y1, step = 15) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step)); for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); if (hm) { c.fillStyle = '#e8e8e8'; c.beginPath(); c.arc(x, y, 0.75, 0, TAU); c.fill(); } else { c.fillStyle = 'rgba(30,30,36,0.22)'; c.beginPath(); c.arc(x, y + 0.25, 0.7, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x, y - 0.1, 0.5, 0, TAU); c.fill(); } } };
  // soft contact shade under something that stands proud of the panel (colour only)
  const shade = (x0, y0, x1, d = 6, a = 0.2) => { if (hm) return; const g = c.createLinearGradient(0, y0, 0, y0 + d); g.addColorStop(0, `rgba(24,26,34,${a})`); g.addColorStop(1, 'rgba(24,26,34,0)'); c.fillStyle = g; c.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), d); };
  const waves = (w, h, n) => { if (!hm) return; for (let i = 0; i < n; i++) { const x = rng.r(0, w), y = rng.r(0, h), r = rng.r(18, 60), g = c.createRadialGradient(x, y, 0, x, y, r), v = rng.chance(0.5) ? 255 : 0; g.addColorStop(0, `rgba(${v},${v},${v},0.05)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); } };
  for (const L of [true, false]) chart(L ? 0 : 1, () => {
    const zx = L ? z => (AT.z1 - z) * 100 : z => (z - AT.z0) * 100;
    const poly = (pts, col) => { if (hm) return; c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(zx(p[0]), yy(p[1])) : c.moveTo(zx(p[0]), yy(p[1]))); c.closePath(); c.fill(); };
    const line = (pts, col, w) => { if (hm) return; c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(zx(p[0]), yy(p[1])) : c.moveTo(zx(p[0]), yy(p[1]))); c.stroke(); };
    waves(740, 296, 90);
    if (!hm) { const g = c.createLinearGradient(0, yy(1.5), 0, yy(0.4)); g.addColorStop(0, 'rgba(60,62,70,0)'); g.addColorStop(1, 'rgba(60,62,70,0.1)'); c.fillStyle = g; c.fillRect(0, yy(1.5), 740, 110); }
    // band with reflective gold coach lines
    poly([[-4.2, 0.98], [2.5, 0.98], [2.66, 1.04], [2.66, 1.12], [2.02, 1.26], [-4.2, 1.26]], C_RED);
    line([[-4.2, 1.305], [2.02, 1.305], [2.66, 1.165]], C_GOLD, 2.6); line([[-4.2, 0.935], [2.54, 0.935]], C_GOLD, 2.6);
    line([[-4.2, 0.985], [2.5, 0.985]], 'rgba(255,255,255,0.16)', 0.5);
    text('MEDIC 14', zx(2.2), yy(1.065), 13.5, '#e6e5e0', 0.4);
    if (!hm) { c.lineWidth = 0.7; c.strokeStyle = 'rgba(40,20,0,0.35)'; c.font = FONT(31); c.textAlign = 'center'; c.letterSpacing = '1.5px'; c.strokeText('KETTER COUNTY EMS', zx(-1.83) + 0.5, yy(1.415) + 0.5); }
    text('KETTER COUNTY EMS', zx(-1.83), yy(1.415), 31, C_RED, 1.5);
    if (!hm) { if (L) { drawEmblem(c, zx(-1.83), yy(2.17), 30); text('EMERGENCY MEDICAL SERVICES', zx(-1.83), yy(1.71), 8.5, '#1d2a44', 2.2, 600); } else { drawEmblem(c, zx(-3.3), yy(1.9), 25); text('PARAMEDIC', zx(-3.3), yy(2.33), 12, '#1d2a44', 1.6); } }
    text('14', zx(0.12), yy(2.36), 20, C_RED, 0);
    if (L) text('ADVANCED LIFE SUPPORT', zx(-3.3), yy(2.33), 7.5, '#1d2a44', 1.6, 600);
    // shut lines: compartment doors, side door, cab door, bonnet, fuel flap
    const box = (z0, z1, y0, y1, w = 0.8) => { const x0 = Math.min(zx(z0), zx(z1)), X1 = Math.max(zx(z0), zx(z1)); c.beginPath(); c.roundRect(x0, yy(y1), X1 - x0, (y1 - y0) * 100, 2.2); gap(w); if (!hm) { c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.35; c.beginPath(); c.roundRect(x0 + 0.75, yy(y1) + 0.75, X1 - x0 - 1.5, (y1 - y0) * 100 - 1.5, 1.8); c.stroke(); shade(x0, yy(y1) + 0.4, X1, 5, 0.16); } };
    for (const d of (L ? AMB.compL : AMB.compR)) box(...d);
    if (!L) box(...AMB.sideDoor, 1.0);
    c.beginPath(); c.moveTo(zx(0.80), yy(1.42)); c.lineTo(zx(0.80), yy(0.47)); c.lineTo(zx(1.50), yy(0.47));
    for (let a = 170; a >= 104; a -= 6) c.lineTo(zx(2.0 + 0.5 * Math.cos(rad(a))), yy(0.385 + 0.5 * Math.sin(rad(a)))); c.lineTo(zx(1.88), yy(1.42)); gap(0.9);
    c.beginPath(); c.moveTo(zx(2.06), yy(1.335)); c.lineTo(zx(2.5), yy(1.225)); c.lineTo(zx(2.72), yy(1.17)); gap(0.6);
    c.beginPath(); c.moveTo(zx(2.4), yy(1.19)); c.lineTo(zx(2.4), yy(0.74)); gap(0.5);                 // wing to nose cone
    if (L) { box(-0.6, -0.84, 0.56, 0.8, 0.6); text('DIESEL FUEL ONLY', zx(-0.72), yy(0.83), 2.7, '#2a2a2e', 0.3); }
    // aluminium body: rivet rows along the roof rail and the corner posts, soft shade under the gutter
    rivets(zx(0.42), yy(2.575), zx(-4.08), yy(2.575), 12.5); for (const z of [0.44, -4.09]) rivets(zx(z), yy(2.5), zx(z), yy(0.56), 15);
    shade(zx(0.5), yy(2.6), zx(-4.15), 7, 0.2);
    if (!hm) {
      // small service decals
      const tag = (z, y, w, h, bg, fg, s, px) => { c.fillStyle = bg; c.beginPath(); c.roundRect(zx(z) - w / 2, yy(y) - h / 2, w, h, 0.6); c.fill(); c.textBaseline = 'middle'; c.font = FONT(px, 700); c.textAlign = 'center'; c.fillStyle = fg; c.fillText(s, zx(z), yy(y) + px * 0.06); c.textBaseline = 'alphabetic'; };
      if (L) { tag(0.075, 2.12, 17, 5.5, '#1c7a2c', '#fff', 'OXYGEN', 3.8); tag(-0.875, 1.33, 15, 3.6, '#f2f2ee', '#8a1414', 'BACKBOARDS', 2.5); tag(-3.3, 2.12, 19, 4.4, '#f2f2ee', '#1d2a44', 'RESCUE TOOLS', 3); }
      else { tag(-0.94, 1.33, 13, 3.6, '#f2f2ee', '#1d2a44', 'BATTERY', 2.5); tag(0.01, 2.32, 20, 4.2, '#8a1414', '#fff', 'PATIENT ENTRY', 2.9); }
      tag(1.34, 0.56, 13, 3.4, '#101014', '#d8d8d4', 'HD 4500', 2.6);
    }
  });
  chart(2, () => {
    waves(250, 296, 20); text('AMBULANCE', 125, yy(2.20), 19, C_RED, 2.5); if (!hm) { c.fillStyle = C_GOLD; c.fillRect(30, yy(2.165), 190, 1.6); }
    rivets(8, yy(2.6), 242, yy(2.6), 13); shade(0, yy(2.62), 250, 6, 0.16);
  });
  chart(3, () => {
    waves(250, 296, 14);
    if (!hm) {
      // rear: red/gold chevrons below the windows (reflective sheeting)
      const y0 = yy(1.62), y1 = yy(0.40); c.fillStyle = C_RED; c.fillRect(0, y0, 250, y1 - y0);
      for (const sg of [1, -1]) {
        c.save(); c.beginPath(); c.rect(sg > 0 ? 0 : 125, y0, 125, y1 - y0); c.clip(); c.strokeStyle = C_GOLD; c.lineWidth = 12.5;
        for (let k = -7; k < 11; k++) { const x = 125 - sg * k * 35.4; c.beginPath(); c.moveTo(x, y1 + 10); c.lineTo(x + sg * 400, y1 + 10 - 400); c.stroke(); }
        c.restore();
      }
      c.fillStyle = C_GOLD; c.fillRect(0, y0 - 2.6, 250, 2.6);
      text('MEDIC 14', 125, yy(2.275), 17, C_RED, 1.2);
    }
    rivets(8, yy(2.62), 242, yy(2.62), 13); for (const x of [6, 244]) rivets(x, yy(2.5), x, yy(0.56), 15);
  });
  chart(4, () => {
    waves(250, 740, 60);
    text('14', 125, (AT.z1 + 2.6) * 100, 150, '#16181c', 4);
    if (!hm) { c.save(); c.translate(125, (AT.z1 - 2.36) * 100); c.scale(1, -1); text('AMBULANCE', 0, 5, 17.5, C_RED, 2.2); c.restore(); }
    c.beginPath(); c.moveTo(125 - 92, (AT.z1 - 2.06) * 100); c.lineTo(125 - 90, (AT.z1 - 2.6) * 100); c.quadraticCurveTo(125 - 88, (AT.z1 - 2.7) * 100, 125 - 78, (AT.z1 - 2.705) * 100); c.lineTo(125 + 78, (AT.z1 - 2.705) * 100); c.quadraticCurveTo(125 + 88, (AT.z1 - 2.7) * 100, 125 + 90, (AT.z1 - 2.6) * 100); c.lineTo(125 + 92, (AT.z1 - 2.06) * 100); gap(0.7);
    // roof of the box: sheet joints with rivet rows, a little standing-water staining
    for (const z of [-0.62, -2.72, -3.62]) { const y = (AT.z1 - z) * 100; c.beginPath(); c.moveTo(8, y); c.lineTo(242, y); gap(0.5); rivets(12, y + 2.2, 238, y + 2.2, 12); }
    for (const x of [9, 241]) rivets(x, (AT.z1 - 0.4) * 100, x, (AT.z1 + 4.1) * 100, 15);
    if (!hm) for (let i = 0; i < 26; i++) { const x = rng.r(15, 235), y = rng.r((AT.z1 - 0.3) * 100, (AT.z1 + 4.0) * 100), r = rng.r(6, 22), g = c.createRadialGradient(x, y, r * 0.5, x, y, r); g.addColorStop(0, 'rgba(90,84,70,0)'); g.addColorStop(0.85, 'rgba(90,84,70,0.07)'); g.addColorStop(1, 'rgba(90,84,70,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  return cv;
}

// Height canvas -> tangent-space normal map (canvas rows run down, texture v runs up).
function heightToNormalCanvas(src, strength) {
  const W = src.width, H = src.height, s = src.getContext('2d').getImageData(0, 0, W, H).data, out = makeCanvas(W, H), oc = out.getContext('2d'), img = oc.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) { const yu = Math.max(0, y - 1) * W, yd = Math.min(H - 1, y + 1) * W, y0 = y * W; for (let x = 0; x < W; x++) {
    const dx = (s[(y0 + Math.min(W - 1, x + 1)) * 4] - s[(y0 + Math.max(0, x - 1)) * 4]) * strength, dy = (s[(yd + x) * 4] - s[(yu + x) * 4]) * strength, l = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y0 + x) * 4;
    d[i] = (-dx * l * 0.5 + 0.5) * 255; d[i + 1] = (dy * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255; } }
  oc.putImageData(img, 0, 0); return out;
}

// Grime atlas in the same layout: R road film (heavy low down and behind the wheels), G damage order (high = first to
// appear), B bare metal inside the scrapes. ambGrimeTex adds A = where the livery is reflective sheeting.
function drawAmbGrime(seed) {
  const W = 2048, H = 1024, S = W / AT.W, rng = makeRng(seed), LW = 512, LH = 256, lo = makeCanvas(LW, LH), lc = lo.getContext('2d'), img = lc.createImageData(LW, LH), d = img.data;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const X = x * AT.W / LW, Y = y * AT.H / LH; let ch = -1; for (let k = 0; k < 5; k++) { const r = AT.rect[k]; if (X >= r[0] && X < r[0] + r[2] && Y >= r[1] && Y < r[1] + r[3]) { ch = k; break; } }
    const r = AT.rect[ch], u = (X - r[0]) / r[2], v = (Y - r[1]) / r[3]; let dirt = 0;
    const n = fbm2(x * 0.045, y * 0.045, 4, seed), streak = fbm2(x * 0.5, y * 0.03, 3, seed + 9);
    if (ch < 4) {
      const h = (1 - v) * AT.y1; dirt = (1 - smooth(0.35, 1.7, h)) * (0.55 + 0.75 * n) + streak * 0.22 * (1 - smooth(0.6, 2.4, h)) + 0.05 * streak;
      if (ch < 2) { const z = ch === 0 ? AT.z1 - u * 7.4 : AT.z0 + u * 7.4; for (const az of [AMB.zF, AMB.zR]) { const b = az - z; if (b > 0 && b < 1.6) dirt += (1 - b / 1.6) * (1 - smooth(0.4, 1.5, h)) * (0.5 + n); } }
      if (ch === 3) dirt = dirt * 1.25 + 0.3 * n * (1 - smooth(1.0, 2.6, h));
    } else dirt = 0.16 * n + 0.14 * streak;
    const i = (y * LW + x) * 4; d[i] = clamp(dirt) * 255; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
  }
  lc.putImageData(img, 0, 0);
  const cv = makeCanvas(W, H), c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(lo, 0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  // rain-washed dirt runs below the roof rail and the door tops
  for (const ch of [0, 1, 3]) { const r = AT.rect[ch], sx = r[2] * S / AT.cm[ch][0], sy = r[3] * S / AT.cm[ch][1]; for (let k = 0; k < 110; k++) { const x = r[0] * S + rng.r(40, (ch === 3 ? 250 : 700)) * sx, y0 = r[1] * S + (AT.y1 - rng.pick([2.58, 2.58, 2.27, 1.42])) * 100 * sy, len = rng.r(10, 70) * sy, g = c.createLinearGradient(0, y0, 0, y0 + len); const a = rng.r(0.05, 0.2); g.addColorStop(0, `rgba(${Math.round(a * 255)},0,0,1)`); g.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = g; c.fillRect(x, y0, rng.r(0.6, 2.2) * sx, len); } }
  // scrapes: front-right corner first, then along the right side, then the rear corner of the box
  const scrape = (ch, x0, y0, len, hgt, order, n) => {
    const r = AT.rect[ch], sx = r[2] * S / AT.cm[ch][0], sy = r[3] * S / AT.cm[ch][1];
    for (let k = 0; k < n; k++) {
      const yk = y0 + rng.r(-hgt, hgt), xa = x0 + rng.r(-len * 0.15, len * 0.3), l = len * rng.r(0.3, 1), wob = rng.r(-4, 4), g = Math.round(255 * clamp(order - rng.r(0, 0.25)));
      c.strokeStyle = `rgb(0,${g},${rng.chance(0.3) ? Math.round(rng.r(90, 200)) : 0})`; c.lineWidth = rng.r(0.5, 1.7) * sy; c.lineCap = 'round';
      c.beginPath(); c.moveTo(r[0] * S + xa * sx, r[1] * S + yk * sy); c.quadraticCurveTo(r[0] * S + (xa + l / 2) * sx, r[1] * S + (yk + wob) * sy, r[0] * S + (xa + l) * sx, r[1] * S + (yk + wob * 0.6) * sy); c.stroke();
    }
  };
  scrape(1, (2.25 - AT.z0) * 100, (AT.y1 - 0.95) * 100, 50, 20, 1.0, 34);     // right front wing
  scrape(2, 12, (AT.y1 - 0.95) * 100, 36, 18, 0.95, 22);                      // front, right corner
  scrape(1, (0.9 - AT.z0) * 100, (AT.y1 - 0.9) * 100, 90, 12, 0.72, 20);     // right cab door
  scrape(1, (-1.6 - AT.z0) * 100, (AT.y1 - 0.8) * 100, 150, 10, 0.45, 20);     // box side
  scrape(1, (-4.1 - AT.z0) * 100, (AT.y1 - 0.75) * 100, 45, 20, 0.3, 16);    // rear corner
  return cv;
}
function ambGrimeTex(seed, livery) {
  const g = drawAmbGrime(seed), W = g.width, H = g.height, d = g.getContext('2d').getImageData(0, 0, W, H).data;
  const t = makeCanvas(W, H), tc = t.getContext('2d'); tc.drawImage(livery, 0, 0, W, H); const l = tc.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) { const o = (H - 1 - y) * W * 4, i0 = y * W * 4; for (let x = 0; x < W * 4; x += 4) { const i = i0 + x, dv = Math.max(Math.abs(l[i] - 219), Math.abs(l[i + 1] - 218), Math.abs(l[i + 2] - 214)); out[o + x] = d[i]; out[o + x + 1] = d[i + 1]; out[o + x + 2] = d[i + 2]; out[o + x + 3] = clamp((dv - 30) / 40) * 255; } }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

// The door mirrors: what a driver sees in them (own flank, road, horizon), multiplied into a true reflection of the sky.
// Left half = main glass, right half = convex spotter.
function drawMirrorSheet() {
  const cv = makeCanvas(512, 256), c = cv.getContext('2d');
  const pane = (x0, wide) => {
    c.save(); c.beginPath(); c.rect(x0, 0, 256, 256); c.clip(); c.translate(x0, 0);
    const hz = wide ? 96 : 104, g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#f4f6f8'); g.addColorStop(1, '#c9ced4'); c.fillStyle = g; c.fillRect(0, 0, 256, hz);
    c.fillStyle = '#6f7378'; c.fillRect(0, hz - (wide ? 10 : 16), 256, wide ? 10 : 16);                                    // far buildings / tree line
    const r = c.createLinearGradient(0, hz, 0, 256); r.addColorStop(0, '#4c4f54'); r.addColorStop(1, '#2c2e31'); c.fillStyle = r; c.fillRect(0, hz, 256, 256 - hz);
    c.strokeStyle = 'rgba(220,200,90,0.75)'; c.lineWidth = wide ? 2 : 3.5; c.beginPath(); c.moveTo(70, hz + 2); c.lineTo(wide ? 20 : -30, 256); c.stroke();   // centre line running back
    c.strokeStyle = 'rgba(230,230,230,0.5)'; c.lineWidth = 2; c.setLineDash([14, 18]); c.beginPath(); c.moveTo(110, hz + 2); c.lineTo(130, 256); c.stroke(); c.setLineDash([]);
    // own flank: the box side receding to the vanishing point (inner edge of the glass)
    const vx = 150, vy = hz - 4, x1 = 256, flank = (ya, yb, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(vx, vy); c.lineTo(x1, ya); c.lineTo(x1, yb); c.closePath(); c.fill(); };
    c.fillStyle = '#b9bbbd'; c.beginPath(); c.moveTo(vx, vy); c.lineTo(x1, -40); c.lineTo(x1, 290); c.closePath(); c.fill();
    flank(150, 196, '#7a1616'); flank(140, 146, '#b88a1c'); flank(200, 206, '#b88a1c'); flank(236, 300, '#232427');
    c.fillStyle = 'rgba(20,22,26,0.5)'; c.beginPath(); c.moveTo(vx, vy); c.lineTo(x1, 290); c.lineTo(x1 - 40, 290); c.closePath(); c.fill();          // shadow beside the truck
    c.restore();
  };
  pane(0, false); pane(256, true);
  return canvasTex(cv, { wrap: false, aniso: 4 });
}

// Instrument and control faces of the cab: cluster dials (needles are separate), siren controller, radio, switches, heater.
function drawCabSheet() {
  const cv = makeCanvas(1024, 512), c = cv.getContext('2d'), uv = {};
  const rect = (name, x, y, w, h) => { uv[name] = [x / 1024, 1 - (y + h) / 512, (x + w) / 1024, 1 - y / 512]; };
  const txt = (s, x, y, px, col = '#dfe6ea', w = 600, al = 'center') => { c.fillStyle = col; c.font = FONT(px, w); c.textAlign = al; c.textBaseline = 'middle'; c.fillText(s, x, y); };
  c.fillStyle = '#08090a'; c.fillRect(0, 0, 1024, 512);
  rect('cluster', 0, 0, 720, 270);
  const dial = (cx, cy, r, max, step, minor, unit) => {
    c.strokeStyle = '#33383c'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r + 7, 0, TAU); c.stroke();
    for (let v = 0; v <= max + 1e-6; v += minor) {
      const a = rad(225 - 270 * v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6, l = big ? 17 : 8;
      c.strokeStyle = '#e8eef2'; c.lineWidth = big ? 3.2 : 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * (r - l), cy - Math.sin(a) * (r - l)); c.stroke();
      if (big) txt(String(Math.round(v)), cx + Math.cos(a) * (r - 34), cy - Math.sin(a) * (r - 34), 19);
    }
    txt(unit, cx, cy + r * 0.5, 13, '#8f9aa2');
  };
  dial(190, 138, 112, 200, 20, 10, 'km/h'); dial(530, 138, 112, 5, 1, 0.25, 'RPM x1000');
  c.fillStyle = '#0d1a14'; c.fillRect(300, 172, 120, 46); txt('D', 318, 195, 24, '#7ef0b0', 700); txt('048213 km', 372, 195, 15, '#7ef0b0');
  for (const [x, lab] of [[330, 'F'], [390, 'H']]) { c.strokeStyle = '#e8eef2'; c.lineWidth = 2; c.beginPath(); c.arc(x, 110, 30, rad(200), rad(340)); c.stroke(); txt(lab, x + 26, 92, 12); txt(lab === 'F' ? 'E' : 'C', x - 26, 92, 12); c.strokeStyle = '#ff5a1a'; c.beginPath(); c.moveTo(x, 110); c.lineTo(x + (lab === 'F' ? 14 : -4), 84); c.stroke(); }
  for (let i = 0; i < 6; i++) { c.fillStyle = ['#1c3a1c', '#3a2a10', '#3a1414', '#12283a', '#3a1414', '#1c3a1c'][i]; c.beginPath(); c.arc(270 + i * 36, 246, 7, 0, TAU); c.fill(); }
  // siren controller
  rect('siren', 0, 280, 360, 220); c.fillStyle = '#16181a'; c.fillRect(0, 280, 360, 220); c.strokeStyle = '#3a3e42'; c.lineWidth = 3; c.strokeRect(3, 283, 354, 214);
  txt('KESTREL 200', 96, 302, 15, '#aeb7bd', 700); c.fillStyle = '#26292c'; c.beginPath(); c.arc(92, 400, 52, 0, TAU); c.fill(); c.strokeStyle = '#d7dde1'; c.lineWidth = 5; c.beginPath(); c.moveTo(92, 400); c.lineTo(122, 366); c.stroke();
  ['RAD', 'PA', 'MAN', 'HF', 'WAIL', 'YELP', 'PHSR'].forEach((l, i) => { const a = rad(215 - i * 42); txt(l, 92 + Math.cos(a) * 74, 400 - Math.sin(a) * 68, 12); });
  ['1', '2', '3', 'HORN', 'AUX'].forEach((l, i) => { c.fillStyle = i < 3 ? '#c41a12' : '#3b3f43'; c.fillRect(186 + i * 34, 318, 28, 28); txt(l, 200 + i * 34, 360, 11); });
  ['FRONT', 'REAR', 'SCENE', 'TKDN'].forEach((l, i) => { c.fillStyle = '#2b2e31'; c.fillRect(190 + i * 42, 400, 32, 54); c.fillStyle = i < 2 ? '#ff3b22' : '#4a1a14'; c.fillRect(200 + i * 42, 406, 12, 8); txt(l, 206 + i * 42, 470, 10); });
  // two-way radio
  rect('radio', 370, 280, 330, 100); c.fillStyle = '#101112'; c.fillRect(370, 280, 330, 100); c.fillStyle = '#1e3b24'; c.fillRect(430, 296, 200, 60); txt('KC EMS DISP', 530, 314, 19, '#9dffa9', 700); txt('CH 04    TAC 2', 530, 340, 15, '#9dffa9');
  for (const x of [398, 664]) { c.fillStyle = '#2b2e31'; c.beginPath(); c.arc(x, 326, 20, 0, TAU); c.fill(); c.strokeStyle = '#aeb7bd'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 326); c.lineTo(x + 8, 310); c.stroke(); }
  // rocker switches
  rect('switch', 370, 390, 330, 110); c.fillStyle = '#16181a'; c.fillRect(370, 390, 330, 110);
  ['PRIM', 'SEC', 'SIDE', 'DOME', 'O2', 'INV'].forEach((l, i) => { c.fillStyle = '#0c0d0e'; c.fillRect(384 + i * 52, 404, 38, 62); c.fillStyle = i % 2 ? '#3a1612' : '#ff3b22'; c.fillRect(390 + i * 52, 410, 26, 22); txt(l, 403 + i * 52, 482, 11); });
  // heater and stereo
  rect('hvac', 730, 0, 290, 130); c.fillStyle = '#141516'; c.fillRect(730, 0, 290, 130);
  [780, 875, 970].forEach((x, i) => { c.fillStyle = '#2b2e31'; c.beginPath(); c.arc(x, 62, 34, 0, TAU); c.fill(); c.strokeStyle = '#d7dde1'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, 62); c.lineTo(x + [-20, 4, 22][i], 62 - [22, 32, 22][i]); c.stroke(); txt(['FAN', 'TEMP', 'MODE'][i], x, 116, 11); });
  rect('stereo', 730, 140, 290, 100); c.fillStyle = '#101112'; c.fillRect(730, 140, 290, 100); c.fillStyle = '#2a1c08'; c.fillRect(790, 156, 170, 44); txt('97.3 FM', 875, 178, 24, '#ffb648', 700);
  for (let i = 0; i < 6; i++) { c.fillStyle = '#2b2e31'; c.fillRect(790 + i * 29, 210, 24, 16); }
  const tex = canvasTex(cv, { wrap: false, aniso: 8 });
  return { tex, uv };
}

// ---------------------------------------------------------------------------------------------- ambulance: build

// Emergency flash plan: [lamp, colour, side (+1 left, -1 right, 0 centre), period s, phase, flashes per burst, weight in lights.strobe]
// Road film the truck carries even when "clean" (setDirt(0)); setDirt(1) is filthy.
const BASE_DIRT = 0.3, SK_MIRROR = skin('texmirror');
const EMERGENCY = [
  ['barFLo', E_RED, 1, 0.84, 0, 3, 1], ['barFRo', E_RED, -1, 0.84, 0.5, 3, 1], ['barFLi', E_RED, 1, 0.84, 0.5, 2, 0.6], ['barFRi', E_RED, -1, 0.84, 0, 2, 0.6],
  ['barFWL', E_WHT, 1, 0.42, 0, 2, 0.7], ['barFWR', E_WHT, -1, 0.42, 0.5, 2, 0.7],
  ['barRLo', E_RED, 1, 0.84, 0.5, 3, 0.5], ['barRRo', E_RED, -1, 0.84, 0, 3, 0.5], ['barRLi', E_RED, 1, 0.84, 0, 2, 0.3], ['barRRi', E_RED, -1, 0.84, 0.5, 2, 0.3],
  ['barRAL', E_AMB, 1, 1.1, 0, 1, 0.3], ['barRAR', E_AMB, -1, 1.1, 0.5, 1, 0.3], ['barEL', E_RED, 1, 0.84, 0.25, 3, 0.5], ['barER', E_RED, -1, 0.84, 0.75, 3, 0.5],
  ['grilleL', E_RED, 1, 0.5, 0, 2, 0.4], ['grilleR', E_WHT, -1, 0.5, 0.5, 2, 0.4], ['interL', E_RED, 1, 0.5, 0.5, 2, 0.4], ['interR', E_RED, -1, 0.5, 0, 2, 0.4],
  ['upFL', E_RED, 1, 1.0, 0, 1, 0.7], ['upFR', E_RED, -1, 1.0, 0.5, 1, 0.7], ['upFC', E_WHT, 0, 0.5, 0.25, 2, 0.4],
  ['sideLF', E_RED, 1, 1.0, 0, 1, 0.6], ['sideLR', E_RED, 1, 1.0, 0.5, 1, 0.6], ['sideRF', E_RED, -1, 1.0, 0.5, 1, 0.6], ['sideRR', E_RED, -1, 1.0, 0, 1, 0.6],
  ['rearUL', E_RED, 1, 1.0, 0, 1, 0.5], ['rearUR', E_RED, -1, 1.0, 0.5, 1, 0.5], ['rearUC', E_AMB, 0, 1.0, 0.25, 1, 0.3], ['rearLL', E_RED, 1, 0.5, 0, 2, 0.4], ['rearLR', E_RED, -1, 0.5, 0.5, 2, 0.4],
];

export function buildAmbulance(opts = {}) {
  const A = AMB, S = opts.texScale ?? 1, seed = opts.seed ?? 14, PI = Math.PI;
  const lamps = new Float32Array(LAMP_N * 3), CHN = {}, glows = []; let nCh = 0;
  const chan = n => (CHN[n] ??= ++nCh);
  const B = new Builder({ chart: ambChart, seg: 4 }), dec = decalSheet();
  // skins with procedural surface detail: tread plate, brushed aluminium / stainless, grained and ribbed plastics, cab trim
  const DIA = withFx(SK.alu, FX.diamond), ALB = withFx(SK.alu, FX.brushed), STB = withFx(SK.steel, FX.brushed, 1), GRN = withFx(SK.black, FX.grain), RIB = withFx(SK.rubber, FX.ribbed), PERF = withFx(SK.black, FX.perf, 0.009);
  const DTOP = withFx(skin('dry', [0.042, 0.043, 0.046], 0.8), FX.grain), DFACE = withFx(skin('dry', [0.105, 0.11, 0.117], 0.72), FX.grain), PILLAR = withFx(skin('dry', [0.17, 0.172, 0.168], 0.8), FX.grain), HEADL = withFx(skin('dry', [0.25, 0.25, 0.24], 0.95), FX.weave, 0.003);
  const D = {
    paint: { sk: SK.paint }, under: { sk: SK.under },
    shell: { sk: SK.paint, inner: DFACE, jamb: SK.rubber }, pillar: { sk: SK.paint, inner: PILLAR, jamb: SK.rubber }, roof: { sk: SK.paint, inner: HEADL, jamb: SK.rubber },
    doorL: { sk: SK.paint, grp: 'doorL', inner: DFACE, jamb: SK.trimDark }, glassDoorL: { glass: SK.glass, grp: 'doorL' }, glass: { glass: SK.glass },
    wall: { sk: SK.paint, inner: SK.whiteGloss, jamb: SK.rubber }, sideDoor: { sk: SK.paint, grp: 'sideDoor', inner: SK.whiteGloss, jamb: SK.alu }, glassSide: { glass: SK.glass, grp: 'sideDoor' },
  };
  // a lamp: bezel + LED lens on channel `name`, facing local +Z after the yaw; registers its halo
  const lamp = (name, tint, w, h, grid, x, y, z, ry = 0, o = {}) => {
    const c = chan(name);
    B.at(x, y, z, o.rx || 0, ry, 0, () => {
      if (o.bezel !== null) B.rbox(o.bezel || SK.chrome, w + 0.026, h + 0.026, 0.014, 0.006, 0, 0, 0.004);
      B.rbox(lens(c, tint, grid), w, h, o.d || 0.026, Math.min(0.011, h * 0.3), 0, 0, 0.012);
      if (o.glow !== 0) glows.push({ pos: B.pt(0, 0, 0.04), dir: B.dir(0, 0, 1), size: clamp((o.glow || Math.max(w, h) * 2.2 + 0.1) * 0.62, 0.1, 0.6), ch: c, gain: o.gain ?? 0.05 });
    });
  };

  // ---- cab: lower body (sill to bonnet), front arches cut into the section's lower edge
  const cabW = z => z < 2.5 ? A.cabW : A.cabW - 0.15 * (1 - Math.sqrt(Math.max(0, 1 - ((z - 2.5) / 0.24) ** 2)));
  const bonnetY = curve([[2.02, 1.42], [2.08, 1.405], [2.5, 1.285], [2.64, 1.235], [2.71, 1.2], [2.74, 1.165]]);
  const cabBot = z => Math.max(z > 2.45 ? 0.5 : A.sill, archY(z, A.zF, A.R, A.archF));
  const cabSec = z => {
    const w = cabW(z), b = cabBot(z), cabin = z <= 2.02, t = cabin ? A.belt : bonnetY(z);
    return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w, y: b, z, r: 0.03 }, { x: w + 0.012, y: Math.max(0.95, b + 0.03), z, r: 0.25 }, { x: w - 0.004, y: t, z, r: cabin ? 0.03 : 0.075 }, { x: 0, y: t + (cabin ? 0 : 0.03), z, r: 0.5 }]);
  };
  const zsCab = stations([A.cabBack, 0.80, 1.15, 1.88, 2.02, 2.022, 2.08, 2.2, 2.35, 2.5], archStations(A.zF, A.archF, 16), range(0, 1, 6).map(t => 2.5 + 0.24 * Math.sin(t * PI / 2)));
  B.loft(zsCab, cabSec, {
    closed: true, inset: 0.075, capB: SK.paint, cell: (i, tag) => {
      const zm = (zsCab[i] + zsCab[i + 1]) / 2, cabin = zm < 2.02;
      if (tag < 1 || tag > 7) return D.under;
      if (tag > 3 && tag < 5) return cabin ? null : D.paint;
      if (!cabin || tag === 1 || tag === 7) return D.paint;
      return tag <= 3 && zm > A.cabDoor[1] && zm < A.cabDoor[0] ? D.doorL : D.shell;
    },
  });

  // ---- cab: greenhouse. Station A is the windscreen edge; its side span is the A-pillar.
  const gx = 0.966, ghSt = [
    { b: 2.02, c: 1.40, y: 2.03, cy: 2.062, x: 0.855, bow: 0.07 }, { b: 1.88, c: 1.27, y: 2.052, cy: 2.09, x: 0.86, bow: 0.05 },
    { b: 1.34, c: 1.03, y: 2.075, cy: 2.115, x: 0.865, bow: 0 }, { b: 0.80, c: 0.80, y: 2.08, cy: 2.12, x: 0.87, bow: 0 }, { b: A.cabBack, c: A.cabBack, y: 2.08, cy: 2.12, x: 0.87, bow: 0 }];
  const gh = B.loft([0, 1, 2, 3, 4], (u, i) => { const s = ghSt[i]; return mirrorRing([{ x: gx, y: A.belt, z: s.b, sub: 3 }, { x: s.x, y: s.y, z: s.c, r: 0.09, sub: 2 }, { x: 0, y: s.cy, z: s.c + s.bow, r: 0.5, k: 8 }], false); }, {
    inset: 0.045, edgeJamb: 'lr', cell: (i, tag) => (tag < 1 || tag > 3) ? ((i === 0 || i === 3) ? D.pillar : tag < 1 ? D.glassDoorL : D.glass) : D.roof,
  });
  // windscreen: Coons patch between the cowl line and station A (pillars and header stay as a painted frame)
  const r0 = gh.rows[0], nR = r0.length, mid = 5, wsL = r0.slice(0, mid + 1), wsT = r0.slice(mid, nR - mid), wsR = r0.slice(nR - mid - 1).reverse();
  const wsB = wsT.map(p => { const x = p[0] / wsT[0][0] * gx; return [x, A.belt, 2.02 + 0.11 * (1 - (x / gx) ** 2)]; });
  B.coons(wsB, wsT, wsL, wsR, { facing: [0, 0.6, 0.8], inset: 0.045, cell: (i, j) => (j < 2 || j >= wsT.length - 3 || i >= 3) ? D.pillar : D.glass });
  B.tube(SK.rubber, wsB.map(p => [p[0] * 1.01, p[1] + 0.004, p[2] + 0.012]), 0.016, 6);        // cowl seal
  B.mirror(s => { B.grp = s > 0 ? 'doorL' : ''; B.tube(SK.rubber, [[gx + 0.006, A.belt + 0.006, 1.87], [gx + 0.006, A.belt + 0.006, 0.81]], 0.011, 6); }); B.grp = '';

  // ---- module: aluminium box, arch cut, right-hand side door and windows, rear door opening
  const zR = A.modR, modBot = z => Math.max(A.modB, archY(z, A.zR, A.R, A.archR));
  const modSec = z => { const b = modBot(z), W = A.modW; return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: W, y: b, z, r: 0.03 }, { x: W, y: Math.max(0.52, b + 0.001), z, flat: true }, { x: W, y: A.winY[0], z, flat: true }, { x: W, y: A.winY[1], z, flat: true }, { x: W, y: 2.42, z, flat: true }, { x: W, y: A.modT, z, r: 0.07 }, { x: 0, y: A.modT + 0.035, z, r: 0.7 }]); };
  const rd = A.rearDoor, rearSec = mirrorRing([{ x: 0, y: rd.y0, z: zR, flat: true }, { x: rd.x, y: rd.y0, z: zR, r: 0.004 }, { x: rd.x, y: rd.y0 + 0.01, z: zR, flat: true }, { x: rd.x, y: A.winY[0], z: zR, flat: true }, { x: rd.x, y: A.winY[1], z: zR, flat: true }, { x: rd.x, y: 2.42, z: zR, flat: true }, { x: rd.x, y: rd.y1, z: zR, r: 0.004 }, { x: 0, y: rd.y1, z: zR, r: 0.3 }]);
  const zsMod = stations([A.modF, A.sideDoor[0], A.sideWin[0], A.sideWin[1], A.sideDoor[1], A.fixedWin[0], -1.2, A.fixedWin[1], -3.0, zR], archStations(A.zR, A.archR, 16)).reverse(), nzM = zsMod.length;
  B.loft([...zsMod, 'rear'], u => u === 'rear' ? rearSec : modSec(u), {
    closed: true, inset: 0.06, capA: SK.paint, edgeJamb: 'b', cell: (i, tag) => {
      if (i === nzM - 1) return D.wall;
      const zm = (zsMod[i] + zsMod[i + 1]) / 2;
      if (tag < 1 || tag > 13) return D.under;
      if (tag === 1 || tag === 13) return D.paint;
      if (tag > 9 && tag < 12) {
        if (zm < A.sideDoor[0] && zm > A.sideDoor[1]) return tag === 10.5 && zm < A.sideWin[0] && zm > A.sideWin[1] ? D.glassSide : D.sideDoor;
        if (tag === 10.5 && zm < A.fixedWin[0] && zm > A.fixedWin[1]) return D.glass;
      }
      return D.wall;
    },
  });
  // rear doors: flat lattice with a window each
  for (const s of [1, -1]) {
    const grp = s > 0 ? 'rearL' : 'rearR', xs = [rd.x - 0.004, rd.x - 0.13, 0.15, 0.004].map(v => v * s), ys = [rd.y0 + 0.006, A.winY[0] + 0.06, A.winY[1], rd.y1 - 0.006], P = [];
    for (const y of ys) for (const x of xs) P.push(x, y, zR - 0.004);
    B.grid(P, 4, 4, { inset: 0.05, edgeJamb: true, facing: [0, 0, -1], cell: (i, j) => i === 1 && j === 1 ? { glass: SK.glass, grp } : { sk: SK.paint, grp, inner: SK.whiteGloss, jamb: SK.rubber } });
    B.grp = grp;
    for (const y of [1.02, 1.66, 2.3]) { B.cyl(SK.steel, 0.014, 0.014, 0.13, s * (rd.x + 0.009), y, zR - 0.012, 'y', 8); B.rbox(STB, 0.075, 0.11, 0.006, 0.003, s * (rd.x - 0.034), y, zR - 0.007); }   // hinges with their leaves
    if (s > 0) B.at(0.13, 1.28, zR - 0.004, 0, PI, 0, () => { B.rbox(SK.steel, 0.2, 0.14, 0.006, 0.004, 0, 0, 0.001); B.rbox(SK.under, 0.17, 0.11, 0.004, 0.003, 0, 0, 0.0035); B.rbox(STB, 0.13, 0.05, 0.014, 0.006, 0, -0.012, 0.008); B.cyl(SK.chrome, 0.012, 0.012, 0.012, -0.065, 0.035, 0.004, 'z', 10); });
    else { B.rbox(STB, 0.03, 0.3, 0.022, 0.008, -0.075, 1.3, zR - 0.02); for (const y of [1.17, 1.43]) B.rbox(SK.steel, 0.045, 0.03, 0.03, 0.006, -0.075, y, zR - 0.014); B.rbox(SK.rubber, 0.024, rd.y1 - rd.y0 - 0.03, 0.01, 0.004, -0.006, (rd.y0 + rd.y1) / 2, zR - 0.008); }
    B.cyl(SK.rubber, 0.02, 0.02, 0.03, s * 0.56, 1.0, zR - 0.02, 'z', 8);                                                                // hold-open catch
    B.grp = '';
  }

  // ---- front fascia: bumper, valance, grille, headlamps
  const zf = A.nose, bpath = range(0, 1, 28).map(t => { const x = 1.035 * Math.cos(t * PI); return [x, 0.575, 2.86 - 0.34 * Math.abs(x / 1.035) ** 4]; });
  B.sweep(SK.chrome, bpath, [{ a: 0, b: -0.13, r: 0.035 }, { a: 0.1, b: -0.13, r: 0.02 }, { a: 0.1, b: 0.1, r: 0.02 }, { a: 0.03, b: 0.13, r: 0.02 }, { a: 0, b: 0.09, r: 0.02 }]);
  B.sweep(SK.black, bpath.map(p => [p[0] * 0.97, 0.405, p[2] - 0.05]), [{ a: 0, b: -0.07, r: 0.02 }, { a: 0.06, b: -0.07, r: 0.01 }, { a: 0.06, b: 0.05, r: 0.01 }, { a: 0, b: 0.05, r: 0.02 }]);
  B.rbox(SK.black, 0.34, 0.19, 0.012, 0.004, 0, 0.575, 2.864); B.at(0, 0.575, 2.871, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, dec.uv.plate0));
  for (const s of [1, -1]) B.rbox(SK.under, 0.07, 0.05, 0.1, 0.01, s * 0.42, 0.37, 2.8);          // tow hooks
  B.rbox(SK.under, 1.02, 0.39, 0.02, 0, 0, 0.935, zf + 0.002);
  for (let k = 0; k < 16; k++) B.box(SK.black, 0.012, 0.38, 0.022, -0.4725 + k * 0.063, 0.935, zf + 0.016);
  for (const y of [0.84, 0.935, 1.03]) B.rbox(SK.chrome, 1.0, 0.042, 0.034, 0.012, 0, y, zf + 0.03);
  for (const y of [0.732, 1.138]) B.rbox(SK.chrome, 1.09, 0.036, 0.05, 0.013, 0, y, zf + 0.024);
  for (const s of [1, -1]) B.rbox(SK.chrome, 0.036, 0.44, 0.05, 0.013, s * 0.527, 0.935, zf + 0.024);
  B.rbox(SK.chrome, 0.15, 0.085, 0.02, 0.02, 0, 0.935, zf + 0.05); B.rbox(SK.gloss, 0.128, 0.064, 0.02, 0.014, 0, 0.935, zf + 0.054);
  B.sweep(GRN, bpath, [{ a: -0.014, b: -0.032, r: 0.008 }, { a: 0.004, b: -0.032, r: 0.004 }, { a: 0.004, b: 0.032, r: 0.004 }, { a: -0.014, b: 0.032, r: 0.008 }]);
  for (const s of [1, -1]) { B.rbox(GRN, 0.075, 0.3, 0.07, 0.022, s * 0.29, 0.6, 2.878); B.rbox(lens(chan('fog'), LENS.clear, [3, 1]), 0.14, 0.045, 0.02, 0.008, s * 0.62, 0.405, 2.72); }
  B.rbox(PERF, 0.9, 0.07, 0.012, 0.004, 0, 0.405, 2.796);
  lamp('grilleL', LENS.red, 0.115, 0.036, [5, 1], 0.27, 0.985, zf + 0.05, 0, { bezel: SK.black }); lamp('grilleR', LENS.clear, 0.115, 0.036, [5, 1], -0.27, 0.985, zf + 0.05, 0, { bezel: SK.black });
  for (const s of [1, -1]) {
    const x = 0.7 * s, nm = s > 0 ? 'L' : 'R';
    B.rbox(SK.chrome, 0.315, 0.345, 0.02, 0.012, x, 0.94, zf + 0.002); B.rbox(SK.gloss, 0.29, 0.32, 0.022, 0.01, x, 0.94, zf + 0.008);
    lamp('head' + nm, LENS.clear, 0.128, 0.165, [3, 4], x + 0.072 * s, 1.005, zf + 0.016, 0, { glow: 1.0, gain: 0.05 });
    lamp('main' + nm, LENS.clear, 0.118, 0.165, [2, 2], x - 0.068 * s, 1.005, zf + 0.016, 0, { glow: 1.1, gain: 0.05 });
    lamp('ind' + nm, LENS.amber, 0.262, 0.072, [9, 2], x, 0.83, zf + 0.016, 0, {});
    lamp('markA', LENS.amber, 0.1, 0.04, [4, 1], s * 1.004, 0.79, 2.33, s * PI / 2, { glow: 0.2 });
    lamp('inter' + nm, LENS.red, 0.13, 0.07, [5, 2], s * 1.003, 0.80, 2.55, s * PI / 2 * 0.92, {});
  }
  for (const [x, y] of [[0, 2.097], [0.3, 2.092], [-0.3, 2.092], [0.64, 2.074], [-0.64, 2.074]]) { B.ball(lens(chan('markA'), LENS.amber), 0.034, 0.02, 0.06, x, y, 1.3, 8); glows.push({ pos: [x, y + 0.02, 1.34], dir: [0, 0.3, 0.95], size: 0.12, ch: chan('markA'), gain: 0.05 }); }

  B.grp = 'crack'; for (const [dx, dy] of [[0.07, 0.06], [-0.05, 0.08], [-0.08, -0.03], [0.02, -0.08], [0.09, -0.02], [-0.02, 0.03]]) B.tube(SK.under, [[-0.775, 1.0, zf + 0.047], [-0.775 + dx * 0.5, 1.0 + dy * 0.6, zf + 0.047], [-0.775 + dx, 1.0 + dy, zf + 0.047]], 0.0022, 3, { up: [0, 0, 1], caps: false }); B.grp = '';
  // ---- cab hardware: mirrors, handles, steps, arch trims
  // rectangular gasket / frame in the local XY plane, facing +Z
  const frame = (sk, w, h, t = 0.024, d = 0.012) => { B.rbox(sk, w + t, t, d, 0.004, 0, h / 2, 0); B.rbox(sk, w + t, t, d, 0.004, 0, -h / 2, 0); B.rbox(sk, t, h - t, d, 0.004, -w / 2, 0, 0); B.rbox(sk, t, h - t, d, 0.004, w / 2, 0, 0); };
  B.mirror(s => {
    B.grp = s > 0 ? 'doorL' : '';
    // tow mirror: two-arm bracket, grained head, flat main glass over a convex spotter
    B.tube(SK.black, [[1.0, 1.7, 1.78], [1.12, 1.735, 1.815], [1.3, 1.735, 1.84], [1.3, 1.7, 1.84]], 0.011, 6); B.tube(SK.black, [[1.0, 1.36, 1.78], [1.12, 1.345, 1.815], [1.3, 1.345, 1.84], [1.3, 1.38, 1.84]], 0.011, 6);
    B.rbox(SK.black, 0.03, 0.05, 0.04, 0.01, 1.005, 1.7, 1.78); B.rbox(SK.black, 0.03, 0.05, 0.04, 0.01, 1.005, 1.36, 1.78);
    B.rbox(GRN, 0.205, 0.375, 0.07, 0.03, 1.3, 1.545, 1.842);
    B.rbox(SK.gloss, 0.186, 0.354, 0.01, 0.004, 1.3, 1.545, 1.806);
    B.at(1.3, 1.6, 1.8005, 0, PI, 0, () => B.plane(SK_MIRROR, 0.172, 0.222, 0, 0, 0, [0, 0, 0.5, 1])); B.at(1.3, 1.428, 1.8005, 0, PI, 0, () => B.plane(SK_MIRROR, 0.172, 0.092, 0, 0, 0, [0.5, 0.1, 1, 0.9]));
    B.at(1.405, 1.6, 1.845, 0, PI / 2, 0, () => B.rbox(lens(chan(s > 0 ? 'indL' : 'indR'), LENS.amber), 0.03, 0.12, 0.008, 0.003));          // repeater on the mirror head
    // door handle in its recess, lock barrel
    B.rbox(SK.gloss, 0.012, 0.075, 0.22, 0.008, 1.012, 1.21, 0.95); B.rbox(SK.chrome, 0.02, 0.032, 0.165, 0.008, 1.024, 1.212, 0.95); B.cyl(SK.chrome, 0.011, 0.011, 0.012, 1.014, 1.21, 0.8, 'x', 10);
    B.grp = '';
    // running board with a tread-plate top, front mud flap
    B.rbox(GRN, 0.21, 0.055, 1.02, 0.015, 0.975, 0.385, 1.18); B.rbox(DIA, 0.17, 0.008, 0.97, 0.002, 0.975, 0.414, 1.18); for (const z of [0.78, 1.58]) B.rbox(SK.under, 0.05, 0.12, 0.05, 0.01, 0.9, 0.44, z);
    B.box(RIB, 0.34, 0.26, 0.012, 0.86, 0.21, A.zF - A.archF - 0.035);
    const arc = range(4, 176, 22).map(a => [1.0, A.R + (A.archF + 0.004) * Math.sin(rad(a)), A.zF + (A.archF + 0.004) * Math.cos(rad(a))]);
    B.sweep(GRN, arc, [{ a: -0.02, b: -0.008, r: 0.006 }, { a: 0.02, b: -0.008, r: 0.008 }, { a: 0.02, b: 0.026, r: 0.01 }, { a: -0.02, b: 0.026, r: 0.006 }], { up: i => [0, Math.sin(rad(4 + i * 172 / 22)), Math.cos(rad(4 + i * 172 / 22))] });
    B.at(0, A.R, A.zF, () => B.lathe(SK.under, [[0.5, A.archF - 0.004], [0.99, A.archF - 0.004]], { axis: 'x', seg: 14, arc: [-PI / 2, PI / 2], flip: true }));
    // bellows seal between cab and box
    B.tube(SK.rubber, [[1.0, 0.46, 0.52], [1.014, 0.95, 0.52], [0.985, 1.4, 0.52], [0.9, 1.98, 0.52], [0.8, 2.105, 0.52], [0.4, 2.135, 0.52], [0, 2.14, 0.52]], 0.024, 6, { caps: false });
    // module: polished fenderette, liner, rub rails, mud flap, corner posts, roof gutter
    const arc2 = range(3, 177, 24).map(a => [A.modW, A.R + (A.archR + 0.004) * Math.sin(rad(a)), A.zR + (A.archR + 0.004) * Math.cos(rad(a))]);
    B.sweep(SK.steel, arc2, [{ a: -0.02, b: -0.01, r: 0.006 }, { a: 0.038, b: -0.01, r: 0.01 }, { a: 0.038, b: 0.04, r: 0.014 }, { a: -0.02, b: 0.04, r: 0.006 }], { up: i => [0, Math.sin(rad(3 + i * 174 / 24)), Math.cos(rad(3 + i * 174 / 24))] });
    B.at(0, A.R, A.zR, () => B.lathe(SK.under, [[0.5, A.archR - 0.004], [A.modW - 0.01, A.archR - 0.004]], { axis: 'x', seg: 14, arc: [-PI / 2, PI / 2], flip: true }));
    for (const [za, zb] of [[A.modF, A.zR + A.archR + 0.06], [A.zR - A.archR - 0.06, zR]]) { B.rbox(ALB, 0.034, 0.07, za - zb, 0.012, A.modW + 0.013, 0.475, (za + zb) / 2); B.rbox(SK.rubber, 0.014, 0.034, za - zb - 0.03, 0.005, A.modW + 0.031, 0.475, (za + zb) / 2); }
    B.box(RIB, 0.5, 0.38, 0.014, 0.9, 0.29, A.zR - A.archR - 0.1); B.rbox(SK.steel, 0.5, 0.03, 0.02, 0.006, 0.9, 0.47, A.zR - A.archR - 0.1);
    for (const z of [A.modF - 0.012, zR + 0.012]) B.rbox(ALB, 0.03, 2.06, 0.03, 0.012, A.modW - 0.004, 1.56, z);
    B.rbox(ALB, 0.024, 0.02, A.modF - zR - 0.08, 0.007, A.modW + 0.008, 2.607, (A.modF + zR) / 2);
  });
  B.tube(SK.black, [[-0.9, 1.36, 2.12], [-0.905, 1.4, 2.12], [-0.93, 2.05, 2.02]], 0.0035, 4);                                              // radio aerial on the wing

  // ---- module lamps and hardware
  const latch = (x, y, z, s) => B.at(x, y, z, 0, s * PI / 2, 0, () => {       // paddle latch: flange, dark pan, brushed paddle, lock barrel
    B.rbox(SK.steel, 0.155, 0.125, 0.006, 0.003, 0, 0, 0.001); B.rbox(SK.under, 0.13, 0.1, 0.004, 0.002, 0, 0, 0.0035);
    B.rbox(STB, 0.1, 0.052, 0.012, 0.005, -0.008, -0.012, 0.006); B.cyl(SK.chrome, 0.011, 0.011, 0.012, 0.05, 0.03, 0.004, 'z', 10);
  });
  for (const s of [1, -1]) {
    const nm = s > 0 ? 'L' : 'R', x = s * (A.modW + 0.002), ry = s * PI / 2;
    lamp(`side${nm}F`, LENS.red, 0.225, 0.145, [8, 5], x, 2.5, 0.2, ry); lamp(`side${nm}R`, LENS.red, 0.225, 0.145, [8, 5], x, 2.5, -3.88, ry);
    lamp('scene' + nm, LENS.clear, 0.25, 0.11, [10, 4], x, 2.515, -1.84, ry, { glow: 0.9 });
    lamp('markA', LENS.amber, 0.09, 0.04, [4, 1], x, 0.6, 0.36, ry, { glow: 0.18 }); lamp('markR', LENS.red, 0.09, 0.04, [4, 1], x, 0.6, -4.05, ry, { glow: 0.18 });
    lamp('ind' + nm, LENS.amber, 0.1, 0.05, [4, 2], x, 1.5, -2.0, ry, { glow: 0.3 });
    for (const d of (s > 0 ? A.compL : A.compR)) {
      const [z0, z1, y0, y1] = d, yl = Math.min(y1 - 0.25, 1.52);
      B.rbox(ALB, 0.03, 0.016, z0 - z1 + 0.07, 0.006, x + s * 0.012, y1 + 0.03, (z0 + z1) / 2);                                            // drip rail
      latch(x, yl, z1 + 0.12, s);
      B.cyl(STB, 0.0075, 0.0075, y1 - y0 - 0.05, x + s * 0.006, (y0 + y1) / 2, z0 - 0.006, 'y', 6); B.box(SK.steel, 0.003, y1 - y0 - 0.05, 0.03, x + s * 0.001, (y0 + y1) / 2, z0 - 0.024);   // piano hinge
    }
    // front face of the box, beside and above the cab
    lamp('upF' + nm, LENS.red, 0.225, 0.145, [8, 5], s * 0.95, 2.5, A.modF + 0.002, 0);
    lamp('markA', LENS.amber, 0.075, 0.035, [3, 1], s * 1.06, 2.635, A.modF + 0.002, 0, { glow: 0.16 });
    // rear face
    lamp('rearU' + nm, LENS.red, 0.225, 0.145, [8, 5], s * 0.95, 2.535, zR - 0.002, PI);
    lamp('sceneB', LENS.clear, 0.22, 0.1, [9, 4], s * 0.47, 2.56, zR - 0.002, PI, { glow: 0.8 });
    lamp('rearL' + nm, LENS.red, 0.17, 0.115, [6, 4], s * 0.975, 1.92, zR - 0.002, PI);
    B.rbox(SK.chrome, 0.2, 0.39, 0.012, 0.012, s * 0.975, 1.285, zR - 0.002);                                                              // one chrome housing for the tail cluster
    lamp('tail', LENS.red, 0.16, 0.105, [6, 4], s * 0.975, 1.42, zR - 0.006, PI, { glow: 0.55, bezel: SK.gloss });
    lamp('ind' + nm, LENS.amber, 0.16, 0.105, [6, 4], s * 0.975, 1.285, zR - 0.006, PI, { bezel: SK.gloss });
    lamp('rev', LENS.clear, 0.16, 0.105, [6, 4], s * 0.975, 1.15, zR - 0.006, PI, { bezel: SK.gloss });
    B.rbox(SK.rubber, 0.11, 0.24, 0.075, 0.02, s * 1.03, 0.6, zR - 0.035);                                                                 // dock bumpers
    // grab rail beside the door opening
    B.tube(STB, [[s * 0.795, 1.02, zR - 0.004], [s * 0.795, 1.05, zR - 0.062], [s * 0.795, 1.83, zR - 0.062], [s * 0.795, 1.86, zR - 0.004]], 0.014, 8, { caps: false });
    for (const y of [1.02, 1.86]) B.cyl(SK.steel, 0.024, 0.024, 0.006, s * 0.795, y, zR - 0.004, 'z', 10);
    if (s < 0) { B.cyl(STB, 0.0085, 0.0085, 1.84, -A.modW - 0.008, 1.47, A.sideDoor[0] - 0.006, 'y', 6); B.box(SK.steel, 0.003, 1.84, 0.03, -A.modW - 0.003, 1.47, A.sideDoor[0] - 0.024); }
  }
  lamp('upFC', LENS.clear, 0.225, 0.145, [8, 5], 0, 2.5, A.modF + 0.002, 0);
  for (const x of [-0.16, 0, 0.16]) { lamp('markA', LENS.amber, 0.075, 0.035, [3, 1], x, 2.635, A.modF + 0.002, 0, { glow: 0.16 }); lamp('markR', LENS.red, 0.075, 0.035, [3, 1], x, 2.66, zR - 0.002, PI, { glow: 0.16 }); }
  lamp('rearUC', LENS.amber, 0.225, 0.11, [8, 4], 0, 2.555, zR - 0.002, PI);
  // side (patient entry) door: latch, drip rail, window gasket, grab rail, step
  B.grp = 'sideDoor'; latch(-A.modW - 0.002, 1.3, -0.25, -1);
  B.at(-A.modW - 0.004, (A.winY[0] + A.winY[1]) / 2, (A.sideWin[0] + A.sideWin[1]) / 2, 0, -PI / 2, 0, () => frame(SK.rubber, A.sideWin[0] - A.sideWin[1], A.winY[1] - A.winY[0]));
  B.tube(STB, [[-A.modW - 0.004, 1.0, 0.3], [-A.modW - 0.055, 1.03, 0.3], [-A.modW - 0.055, 1.5, 0.3], [-A.modW - 0.004, 1.53, 0.3]], 0.013, 8, { caps: false }); B.grp = '';
  B.at(-A.modW - 0.004, (A.winY[0] + A.winY[1]) / 2, (A.fixedWin[0] + A.fixedWin[1]) / 2, 0, -PI / 2, 0, () => { frame(SK.rubber, A.fixedWin[0] - A.fixedWin[1], A.winY[1] - A.winY[0]); B.rbox(SK.black, 0.022, A.winY[1] - A.winY[0], 0.012, 0.004); });
  B.rbox(ALB, 0.03, 0.016, 0.88, 0.006, -A.modW - 0.012, 2.45, 0.01);
  B.rbox(SK.under, 0.2, 0.2, 0.74, 0.02, -A.modW + 0.07, 0.36, 0.01); B.rbox(DIA, 0.23, 0.012, 0.74, 0.003, -A.modW - 0.05, 0.3, 0.01); for (const z of [0.36, -0.34]) B.rbox(SK.under, 0.22, 0.14, 0.02, 0.004, -A.modW - 0.04, 0.365, z);
  // shore power inlet and battery vent on the street side
  B.at(1.1, 1.02, A.modF + 0.002, () => { B.rbox(SK.black, 0.1, 0.11, 0.012, 0.01); B.rbox(SK.yellow, 0.082, 0.09, 0.03, 0.012, 0, 0, 0.012); B.cyl(SK.gloss, 0.012, 0.012, 0.02, 0, 0.055, 0.014, 'x', 8); });
  B.at(A.modW + 0.002, 0.66, -3.3, 0, PI / 2, 0, () => { B.rbox(SK.steel, 0.2, 0.1, 0.006, 0.004); B.rbox(PERF, 0.18, 0.08, 0.004, 0.002, 0, 0, 0.003); });
  // rear: tread-plate kick panel, flip-up step bumper, threshold, plate, door-window gaskets
  B.rbox(DIA, 2.37, 0.415, 0.008, 0.002, 0, 0.655, zR - 0.004);
  B.rbox(ALB, 2.28, 0.075, 0.3, 0.016, 0, 0.415, -4.3); B.rbox(DIA, 2.2, 0.008, 0.25, 0.002, 0, 0.455, -4.3); B.rbox(SK.under, 2.16, 0.2, 0.06, 0.012, 0, 0.3, -4.19);
  for (const s of [1, -1]) { B.rbox(SK.rubber, 0.05, 0.085, 0.305, 0.02, s * 1.15, 0.415, -4.3); B.rbox(SK.under, 0.06, 0.16, 0.26, 0.01, s * 0.62, 0.34, -4.29); B.at(s * 0.86, 0.415, -4.452, 0, PI, 0, () => B.rbox(SK.red, 0.26, 0.04, 0.006, 0.003)); }
  for (const x of [-0.37, 0.37]) B.box(SK.under, 0.004, 0.012, 0.27, x, 0.455, -4.3);                                                    // the centre section hinges up
  B.rbox(ALB, 1.34, 0.085, 0.016, 0.004, 0, 0.83, zR - 0.009); B.rbox(DIA, 1.3, 0.004, 0.06, 0.001, 0, 0.872, zR + 0.02);
  B.rbox(SK.black, 0.34, 0.19, 0.014, 0.004, 0, 0.61, zR - 0.014); B.at(0, 0.61, zR - 0.022, 0, PI, 0, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, dec.uv.plate0));
  lamp('plate', LENS.clear, 0.12, 0.018, null, 0, 0.725, zR - 0.008, PI, { rx: 0.9, bezel: SK.black, glow: 0 });
  for (const s of [1, -1]) { B.grp = s > 0 ? 'rearL' : 'rearR'; B.at(s * 0.34, (A.winY[0] + 0.06 + A.winY[1]) / 2, zR - 0.006, 0, PI, 0, () => frame(SK.rubber, 0.38, A.winY[1] - A.winY[0] - 0.06)); } B.grp = '';

  // ---- light bar on the roof of the box: 8 modules forward, 8 back, one each end, on an aluminium extrusion
  const barZ = 0.2, barY = A.modT + 0.045;
  B.rbox(SK.black, 1.72, 0.09, 0.2, 0.012, 0, barY + 0.055, barZ); B.rbox(ALB, 1.84, 0.02, 0.24, 0.008, 0, barY + 0.113, barZ); B.rbox(SK.gloss, 1.86, 0.008, 0.335, 0.004, 0, barY + 0.1, barZ); B.rbox(ALB, 1.84, 0.022, 0.33, 0.008, 0, barY + 0.006, barZ);
  for (const s of [1, -1]) { B.rbox(SK.under, 0.13, 0.05, 0.4, 0.012, s * 0.62, barY - 0.02, barZ); B.rbox(SK.steel, 0.05, 0.012, 0.44, 0.004, s * 0.62, barY - 0.043, barZ); B.rbox(SK.gloss, 0.03, 0.1, 0.3, 0.012, s * 0.895, barY + 0.058, barZ); }
  const fr = [['barFLo', 'red'], ['barFLo', 'red'], ['barFWL', 'clear'], ['barFLi', 'red'], ['barFRi', 'red'], ['barFWR', 'clear'], ['barFRo', 'red'], ['barFRo', 'red']];
  const rr = [['barRLo', 'red'], ['barRLo', 'red'], ['barRAL', 'amber'], ['barRLi', 'red'], ['barRRi', 'red'], ['barRAR', 'amber'], ['barRRo', 'red'], ['barRRo', 'red']];
  for (let k = 0; k < 8; k++) {
    const x = 0.7525 - k * 0.215;
    lamp(fr[k][0], LENS[fr[k][1]], 0.2, 0.072, [6, 2], x, barY + 0.058, barZ + 0.1, 0, { bezel: null, d: 0.1, glow: 0.62, gain: 0.055 });
    lamp(rr[k][0], LENS[rr[k][1]], 0.2, 0.072, [6, 2], x, barY + 0.058, barZ - 0.1, PI, { bezel: null, d: 0.1, glow: 0.62, gain: 0.055 });
    if (k) B.box(SK.black, 0.014, 0.082, 0.325, x + 0.1075, barY + 0.056, barZ);                                                           // dividers between the modules
  }
  lamp('barEL', LENS.red, 0.19, 0.072, [6, 2], 0.865, barY + 0.058, barZ, PI / 2, { bezel: null, d: 0.06, glow: 0.62, gain: 0.055 }); lamp('barER', LENS.red, 0.19, 0.072, [6, 2], -0.865, barY + 0.058, barZ, -PI / 2, { bezel: null, d: 0.06, glow: 0.62, gain: 0.055 });
  // roof furniture: air-conditioning condenser, vent, aerials, GPS puck
  B.at(0, A.modT + 0.035, -1.08, () => {
    B.rbox(SK.white, 0.98, 0.15, 0.62, 0.05, 0, 0.07, 0); B.rbox(PERF, 0.8, 0.008, 0.4, 0.002, 0, 0.146, 0.02);
    for (const x of [-0.2, 0.2]) { B.cyl(SK.under, 0.15, 0.15, 0.004, x, 0.151, 0.02, 'y', 20); B.cyl(SK.black, 0.03, 0.03, 0.012, x, 0.153, 0.02, 'y', 10); for (let k = 0; k < 3; k++) B.at(x, 0.153, 0.02, 0, k * TAU / 3, 0, () => B.box(SK.black, 0.012, 0.004, 0.28)); }
    for (let k = 0; k < 7; k++) B.box(SK.under, 0.9, 0.012, 0.006, 0, 0.035 + k * 0.014, -0.311);
  });
  B.rbox(SK.white, 0.44, 0.06, 0.44, 0.025, 0, A.modT + 0.055, -3.3); for (let k = 0; k < 3; k++) B.box(SK.under, 0.36, 0.007, 0.004, 0, A.modT + 0.05 + k * 0.013, -3.521);
  for (const [x, z, h] of [[0.86, -0.5, 0.58], [-0.86, -0.75, 0.42], [-0.86, -3.4, 0.3]]) { B.cyl(SK.black, 0.024, 0.016, 0.045, x, A.modT + 0.033, z, 'y', 10); B.cyl(SK.chrome, 0.008, 0.006, 0.05, x, A.modT + 0.078, z, 'y', 6); B.tube(SK.black, [[x, A.modT + 0.1, z], [x, A.modT + 0.1 + h, z - 0.025]], 0.0032, 4); }
  B.ball(SK.white, 0.05, 0.028, 0.05, 0.84, A.modT + 0.035, -1.9, 10); B.rbox(SK.black, 0.05, 0.05, 0.16, 0.02, 0.6, A.modT + 0.043, -0.42);

  // ---- wipers (one shared mesh, hinged at the origin; arm along +X in the glass plane)
  B.grp = 'wiper'; B.tube(SK.black, [[0, 0, 0.02], [0.3, 0, 0.038], [0.5, 0, 0.03]], 0.007, 5); B.rbox(SK.black, 0.05, 0.04, 0.03, 0.01, 0, 0, 0.015); B.rbox(SK.rubber, 0.56, 0.016, 0.024, 0.005, 0.47, 0, 0.016); B.tube(SK.black, [[0.22, 0, 0.03], [0.47, 0, 0.044], [0.72, 0, 0.03]], 0.004, 4); B.cyl(SK.gloss, 0.016, 0.016, 0.02, 0, 0, 0.035, 'z', 8); B.grp = '';

  // ---- chassis and running gear
  for (const s of [1, -1]) { B.box(SK.under, 0.08, 0.2, 6.3, s * 0.43, 0.56, -0.95); B.rbox(SK.iron, 0.07, 0.03, 1.3, 0.008, s * 0.6, 0.47, A.zR); }
  B.rbox(SK.under, 1.0, 0.5, 1.15, 0.05, 0, 0.62, A.zF); B.rbox(SK.under, 0.72, 0.36, 1.2, 0.08, 0, 0.5, 1.2); B.box(SK.under, 1.02, 0.5, 1.2, 0, 0.66, A.zR);
  B.cyl(SK.iron, 0.07, 0.07, 1.86, 0, A.R, A.zR, 'x', 10); B.ball(SK.iron, 0.2, 0.19, 0.2, 0, A.R, A.zR, 12);
  B.cyl(SK.iron, 0.045, 0.045, 2.6, 0, 0.44, -0.7, 'z', 8); B.rbox(SK.iron, 1.6, 0.08, 0.1, 0.02, 0, 0.33, A.zF);
  B.rbox(SK.under, 0.8, 0.3, 0.95, 0.06, 0, 0.5, -3.25);
  B.tube(SK.iron, [[-0.3, 0.42, 1.3], [-0.42, 0.36, 0.2], [-0.45, 0.36, -1.5], [-0.45, 0.5, -2.0], [-0.6, 0.38, -2.6], [-1.12, 0.36, -2.78]], 0.038, 8);
  B.cyl(SK.iron, 0.11, 0.11, 0.75, -0.44, 0.36, -0.75, 'z', 12);
  B.tube(SK.chrome, [[-1.04, 0.36, -2.773], [-1.2, 0.36, -2.786]], 0.046, 10, { capSk: SK.under });                                      // tailpipe tip ahead of the right rear wheel

  // ---- patient compartment as seen through the doors and windows (walls and ceiling are the box's inner shell)
  const iw = A.modW - 0.06, fy = A.floor, SKF = surf([0.2, 0.21, 0.22], 0.5), SKC = surf([0.05, 0.075, 0.13], 0.5), SKY = surf(0xd9b400, 0.35);
  B.box(SKF, iw * 2, 0.05, A.modF - zR - 0.1, 0, fy - 0.025, (A.modF + zR) / 2);
  B.at(0, 0, A.modF - 0.058, 0, PI, 0, () => { B.plane(SK.whiteGloss, iw * 2, A.modT - fy, 0, (A.modT + fy) / 2, 0); B.plane(SK.gloss, 0.5, 0.4, 0.1, 1.75, 0.004); });
  B.rbox(SK.whiteGloss, 0.42, 1.74, 2.3, 0.02, iw - 0.21, fy + 0.87, -1.0);                              // street-side cabinet wall
  for (let k = 0; k < 3; k++) B.rbox(surf([0.25, 0.3, 0.34], 0.08), 0.01, 0.42, 0.66, 0.004, iw - 0.425, 2.28, -0.3 - k * 0.72);
  B.rbox(SKC, 0.46, 0.1, 0.5, 0.03, iw - 0.3, fy + 0.5, -2.45); B.rbox(SKC, 0.1, 0.5, 0.5, 0.03, iw - 0.08, fy + 0.8, -2.45);     // CPR seat
  B.rbox(SK.whiteGloss, 0.5, 0.42, 2.1, 0.02, -iw + 0.25, fy + 0.21, -2.3); B.rbox(SKC, 0.5, 0.09, 2.06, 0.03, -iw + 0.25, fy + 0.46, -2.3); B.rbox(SKC, 0.09, 0.42, 2.06, 0.03, -iw + 0.06, fy + 0.75, -2.3);   // squad bench
  B.rbox(SK.whiteGloss, 0.36, 0.5, 2.1, 0.02, -iw + 0.18, 2.36, -2.3);
  B.rbox(SKC, 0.5, 0.1, 0.5, 0.04, 0.1, fy + 0.5, 0.05); B.rbox(SKC, 0.5, 0.62, 0.1, 0.04, 0.1, fy + 0.85, 0.3);                // attendant seat
  B.rbox(SK.iron, 0.52, 0.06, 1.95, 0.02, 0.02, fy + 0.5, -2.1); B.rbox(SKC, 0.54, 0.09, 1.9, 0.035, 0.02, fy + 0.6, -2.1);     // cot
  for (const z of [-1.3, -2.9]) for (const x of [-0.2, 0.24]) B.cyl(SK.iron, 0.015, 0.015, 0.5, x, fy + 0.25, z, 'y', 6);
  B.tube(SKY, [[0.05, A.modT - 0.1, -0.2], [0.05, A.modT - 0.16, -0.3], [0.05, A.modT - 0.16, -3.6], [0.05, A.modT - 0.1, -3.7]], 0.016, 8);
  for (const z of [-0.5, -1.6, -2.7, -3.6]) for (const x of [-0.5, 0.5]) { B.rbox(lens(chan('interior'), g3(0.75), [6, 6]), 0.2, 0.012, 0.2, 0.004, x, A.modT - 0.04, z); }

  // ---- cab interior: its own builder and group (`cab`), in materials that rain never wets
  const C = new Builder({ seg: 3, single: sk => sk.mat.startsWith('tex') ? sk.mat : 'dry' }), cs = drawCabSheet(), eye = [0.44, 1.82, 1.0];
  const zb = x => 2.02 + 0.11 * (1 - (x / gx) ** 2), onDash = (x, y, fn) => { const a = y > 1.12 ? lerp(0.44, 0.455, (y - 1.12) / 0.18) : lerp(0.38, 0.44, (y - 0.98) / 0.14), z = zb(x) + 0.008 - a; C.face(x, y, z, x, y + 0.2, z - 1, fn); };
  const T = DFACE, TD = DTOP, TS = SK.trimDark, VIN = withFx(SK.vinyl, FX.weave, 0.0021), LEA = withFx(skin('dry', [0.034, 0.034, 0.037], 0.5), FX.grain), VISOR = withFx(skin('dry', [0.12, 0.122, 0.125], 0.9), FX.weave, 0.0026), GRILL = withFx(SK.gloss, FX.perf, 0.0045), VENT = withFx(SK.gloss, FX.ribbed);
  C.box(withFx(TS, FX.ribbed), 1.86, 0.04, 1.5, 0, 0.72, 1.28);                                           // rubber floor
  C.at(0, 0, 0.585, () => { C.plane(PILLAR, 1.9, 1.5, 0, 1.4, 0); C.rbox(TS, 0.62, 0.46, 0.012, 0.004, 0, 1.62, 0.002); C.rbox(SK.gloss, 0.56, 0.4, 0.012, 0.004, 0, 1.62, 0.006); C.rbox(SK.red, 0.11, 0.3, 0.1, 0.03, -0.72, 1.0, 0.06); C.cyl(SK.black, 0.02, 0.03, 0.06, -0.72, 1.18, 0.06, 'y', 8); });   // back wall, pass-through, extinguisher
  C.at(0, 0, 2.0, 0, PI, 0, () => C.plane(TS, 1.9, 0.5, 0, 0.92, 0));                                      // firewall
  // dashboard: a dark grained pad over a lighter fascia, both swept along the base of the windscreen
  const dpath = range(0, 1, 16).map(t => { const x = lerp(0.935, -0.935, t); return [x, 0, zb(x) + 0.012]; });
  C.sweep(TD, dpath, [{ a: 0, b: 1.425, r: 0.008 }, { a: 0.4, b: 1.452, r: 0.045 }, { a: 0.475, b: 1.4, r: 0.03 }, { a: 0.465, b: 1.3, r: 0.008 }, { a: 0, b: 1.3, r: 0.008 }], { seg: 3 });
  C.sweep(T, dpath, [{ a: 0, b: 1.305, r: 0.008 }, { a: 0.455, b: 1.305, r: 0.006 }, { a: 0.44, b: 1.12, r: 0.03 }, { a: 0.38, b: 0.98, r: 0.05 }, { a: 0.2, b: 0.86, r: 0.03 }, { a: 0, b: 0.86, r: 0.008 }], { seg: 3 });
  for (const x of [0.62, 0.22, -0.22, -0.62]) C.at(x, 1.4335, zb(x) - 0.075, 0, Math.atan(0.22 * x / (gx * gx)), 0, () => { C.rbox(SK.gloss, 0.32, 0.006, 0.05, 0.002); C.box(VENT, 0.3, 0.004, 0.036, 0, 0.003, 0); });   // defroster outlets
  C.at(-0.52, 1.458, 1.83, 0, 0.3, 0, () => { C.rbox(skin('dry', [0.02, 0.05, 0.14], 0.4), 0.2, 0.012, 0.27, 0.004); C.rbox(SK.white, 0.185, 0.004, 0.25, 0.002, 0, 0.007, 0); C.rbox(SK.chrome, 0.09, 0.012, 0.03, 0.004, 0, 0.012, 0.12); });   // run clipboard on the dash
  // instrument binnacle with its hood
  const pc = [0.44, 1.345, zb(0.44) - 0.478];
  C.face(...pc, ...eye, () => { C.rbox(TS, 0.43, 0.19, 0.02, 0.006, 0, 0, -0.012); C.plane(SK_CAB, 0.38, 0.1425, 0, 0, 0, cs.uv.cluster); C.rbox(TD, 0.5, 0.036, 0.17, 0.015, 0, 0.106, 0.03); for (const s of [1, -1]) C.rbox(TD, 0.03, 0.215, 0.14, 0.012, s * 0.238, 0.004, 0.02); C.rbox(TD, 0.46, 0.02, 0.06, 0.008, 0, -0.1, 0.012); });
  C.grp = 'needle'; C.box(lens(chan('gauge'), lin(0xff5a1a)), 0.0035, 0.052, 0.002, 0, 0.02, 0.004); C.cyl(SK.gloss, 0.008, 0.008, 0.006, 0, 0, 0.004, 'z', 8); C.grp = '';
  // steering wheel (group `wheel`: rim in its XY plane, +Z towards the driver), column and stalks
  const pw = [0.44, 1.3, 1.5], wn = [0, 0.42, -0.908];
  C.grp = 'wheel'; C.tube(LEA, range(0, 1, 32).slice(0, -1).map(t => [Math.cos(t * TAU) * 0.19, Math.sin(t * TAU) * 0.19, 0]), 0.0175, 10, { loop: true, up: [0, 0, 1] });
  C.rbox(TD, 0.175, 0.125, 0.055, 0.03, 0, -0.005, -0.022); C.cyl(SK.chrome, 0.02, 0.02, 0.004, 0, 0, 0.007, 'z', 12); for (const a of [14, 166, -42, -138]) C.at(0, 0, -0.014, 0, 0, rad(a), () => { C.rbox(TD, 0.18, 0.036, 0.022, 0.01, 0.1, 0, 0); if (a > 0) C.rbox(SK.gloss, 0.05, 0.026, 0.006, 0.003, 0.09, 0, 0.012); }); C.grp = '';
  C.tube(TD, [[pw[0], pw[1] - wn[1] * 0.03, pw[2] - wn[2] * 0.03], [pw[0], pw[1] - wn[1] * 0.36, pw[2] - wn[2] * 0.36]], 0.045, 10);
  for (const s of [1, -1]) { C.tube(TS, [[0.44 + s * 0.03, 1.262, 1.585], [0.44 + s * 0.17, 1.275, 1.56]], 0.009, 5); C.cyl(SK.gloss, 0.013, 0.013, 0.04, 0.44 + s * 0.175, 1.276, 1.559, 'x', 8); }
  C.tube(TS, [[0.4, 1.27, 1.6], [0.3, 1.36, 1.56], [0.27, 1.4, 1.54]], 0.008, 5); C.ball(SK.gloss, 0.022, 0.022, 0.022, 0.265, 1.405, 1.538, 8);     // column shifter
  // engine cover and the equipment console between the seats
  C.rbox(T, 0.6, 0.5, 0.72, 0.08, 0, 0.95, 1.72); C.rbox(TD, 0.36, 0.36, 0.66, 0.03, 0, 0.94, 1.1);
  C.face(0, 1.2, 1.36, 0.22, 2.1, 0.7, () => { C.rbox(TS, 0.21, 0.135, 0.07, 0.008, 0, 0, -0.036); C.plane(SK_CAB, 0.19, 0.116, 0, 0, 0.001, cs.uv.siren); C.cyl(SK.gloss, 0.022, 0.018, 0.022, -0.045, -0.01, 0.012, 'z', 12); });
  C.face(0, 1.137, 1.19, 0.15, 2.1, 0.9, () => { C.rbox(TS, 0.2, 0.068, 0.03, 0.006, 0, 0, -0.016); C.plane(SK_CAB, 0.19, 0.0576, 0, 0, 0.001, cs.uv.radio); for (const x of [-0.079, 0.081]) C.cyl(SK.gloss, 0.01, 0.009, 0.014, x, 0.003, 0.008, 'z', 10); });
  C.face(0, 1.128, 1.08, 0.1, 2.1, 0.9, () => { C.rbox(TS, 0.2, 0.074, 0.02, 0.006, 0, 0, -0.011); C.plane(SK_CAB, 0.19, 0.0633, 0, 0, 0.001, cs.uv.switch); });
  C.rbox(TS, 0.045, 0.075, 0.03, 0.008, 0.2, 1.06, 1.3); C.tube(TS, [[0.2, 1.03, 1.3], [0.22, 0.93, 1.26], [0.19, 0.9, 1.18], [0.17, 0.98, 1.1]], 0.005, 4);      // radio microphone and cord
  for (const x of [-0.08, 0.08]) C.cyl(SK.gloss, 0.04, 0.04, 0.008, x, 1.124, 0.88, 'y', 12);              // cup holders
  // mobile data terminal on its pedestal, angled at the driver
  const pm = [-0.16, 1.57, 1.6];
  C.tube(TS, [[-0.21, 1.1, 1.4], [-0.21, 1.36, 1.5], [-0.17, 1.44, 1.57]], 0.014, 6);
  C.face(...pm, ...eye, () => { C.rbox(TS, 0.34, 0.226, 0.02, 0.008, 0, 0, -0.011); C.plane(SK_MDT, 0.31, 0.194, 0, 0, 0.001); for (const s of [1, -1]) C.rbox(SK.rubber, 0.03, 0.03, 0.026, 0.008, s * 0.165, 0.108 * s, -0.008); });
  C.face(pm[0], 1.445, 1.54, 0.2, 2.6, 1.0, () => { C.rbox(TS, 0.33, 0.2, 0.02, 0.006, 0, 0, -0.01); C.rbox(withFx(SK.trim, FX.ribbed, 1), 0.29, 0.1, 0.004, 0.002, 0, 0.03, 0.001); for (let i = 1; i < 12; i++) C.box(SK.trimDark, 0.003, 0.1, 0.0045, -0.145 + i * 0.0242, 0.03, 0.001); C.rbox(SK.trim, 0.1, 0.05, 0.003, 0.002, 0, -0.06, 0.001); });
  // centre stack, vents, glovebox, pedals
  const vent = (w, h) => { C.rbox(SK.gloss, w, h, 0.012, 0.004); for (const y of [-0.021, -0.007, 0.007, 0.021]) C.at(0, y, 0.006, 0.5, 0, 0, () => C.box(TS, w - 0.012, 0.002, 0.016)); C.box(SK.gloss, 0.008, 0.012, 0.012, 0, 0, 0.012); };
  onDash(-0.1, 1.24, () => { for (const x of [-0.11, 0.11]) C.at(x, 0, 0, () => vent(0.15, 0.07)); });
  onDash(-0.1, 1.135, () => C.plane(SK_CAB, 0.2, 0.069, 0, 0, 0.004, cs.uv.stereo)); onDash(-0.1, 1.03, () => C.plane(SK_CAB, 0.2, 0.0897, 0, 0, 0.002, cs.uv.hvac));
  for (const x of [0.83, -0.83]) onDash(x, 1.24, () => vent(0.13, 0.07));
  onDash(-0.55, 1.08, () => { C.rbox(TD, 0.44, 0.19, 0.006, 0.004); C.rbox(SK.gloss, 0.07, 0.022, 0.012, 0.004, 0, 0.065, 0.004); C.plane(SK.white, 0.1, 0.03, 0.12, -0.06, 0.004); });
  onDash(0.72, 1.1, () => { C.rbox(TS, 0.1, 0.07, 0.006, 0.003); C.cyl(SK.gloss, 0.022, 0.02, 0.016, 0, 0, 0.008, 'z', 12); });       // headlamp switch
  C.at(0.56, 0.86, 1.9, -0.5, 0, 0, () => C.rbox(withFx(TS, FX.ribbed), 0.06, 0.13, 0.02, 0.008)); C.at(0.4, 0.88, 1.88, -0.4, 0, 0, () => C.rbox(withFx(TS, FX.ribbed), 0.11, 0.08, 0.02, 0.008));
  // seats
  for (const s of [1, -1]) {
    const x = s * 0.44;
    C.rbox(TS, 0.42, 0.28, 0.44, 0.03, x, 0.86, 1.0); C.rbox(VIN, 0.5, 0.13, 0.5, 0.05, x, 1.045, 1.0);
    C.at(x, 1.42, 0.735, -0.12, 0, 0, () => { C.rbox(VIN, 0.5, 0.66, 0.13, 0.05); C.rbox(VIN, 0.27, 0.19, 0.1, 0.04, 0, 0.44, 0.012); for (const b of [1, -1]) C.rbox(VIN, 0.07, 0.5, 0.1, 0.03, b * 0.23, -0.04, 0.05); for (const b of [1, -1]) C.cyl(SK.chrome, 0.006, 0.006, 0.08, b * 0.06, 0.34, 0, 'y', 6); });
    C.rbox(VIN, 0.07, 0.05, 0.3, 0.02, x - s * 0.28, 1.25, 0.92);
    C.tube(surf(g3(0.03), 0.9), [[s * 0.905, 1.95, 0.72], [s * 0.72, 1.5, 0.82], [x - s * 0.24, 1.08, 0.9]], 0.012, 4); C.rbox(SK.red, 0.03, 0.05, 0.03, 0.006, x - s * 0.25, 1.1, 0.9);
    // door card (the left side hinges with the door): armrest, pull, speaker, switches, map pocket
    C.grp = s > 0 ? 'doorL' : '';
    C.rbox(TD, 0.08, 0.06, 0.62, 0.02, s * 0.885, 1.16, 1.3); C.rbox(T, 0.03, 0.17, 0.95, 0.012, s * 0.912, 1.33, 1.33); C.rbox(TD, 0.05, 0.16, 0.7, 0.02, s * 0.9, 0.86, 1.3);
    C.cyl(GRILL, 0.085, 0.085, 0.012, s * 0.922, 0.98, 1.72, 'x', 16); C.rbox(SK.chrome, 0.012, 0.03, 0.09, 0.005, s * 0.916, 1.3, 1.64); C.rbox(SK.gloss, 0.012, 0.03, 0.14, 0.004, s * 0.845, 1.192, 1.42);
    C.tube(TS, [[s * 0.9, 1.19, 1.05], [s * 0.86, 1.26, 1.08], [s * 0.86, 1.26, 1.22], [s * 0.9, 1.19, 1.25]], 0.011, 5, { caps: false });
    C.grp = '';
    // sun visor on its rod, grab handle on the A-pillar
    C.at(s * 0.42, 1.972, 1.33, 1.16, 0, 0, () => { C.rbox(VISOR, 0.46, 0.17, 0.022, 0.01); C.rbox(TD, 0.47, 0.012, 0.026, 0.005, 0, -0.082, 0); C.rbox(SK.gloss, 0.05, 0.02, 0.03, 0.006, -s * 0.2, 0.08, 0); }); C.tube(SK.gloss, [[s * 0.66, 2.025, 1.33], [s * 0.2, 2.03, 1.33]], 0.006, 5); C.rbox(SK.gloss, 0.03, 0.02, 0.03, 0.005, s * 0.17, 2.035, 1.33);
    C.tube(T, [[s * 0.905, 1.6, 1.74], [s * 0.868, 1.64, 1.67], [s * 0.85, 1.83, 1.5], [s * 0.868, 1.9, 1.47]], 0.009, 8, { caps: false });
  }
  // overhead switch console and dome lamp, firewall-side kick panels
  C.at(0, 2.045, 1.2, () => { C.rbox(PILLAR, 0.34, 0.07, 0.4, 0.025); C.at(0, -0.036, -0.02, PI / 2 + 0.25, 0, 0, () => { C.plane(SK_CAB, 0.2, 0.0667, 0, 0, 0, cs.uv.switch); }); for (const x of [-0.13, 0.13]) C.cyl(lens(chan('cabDome'), g3(0.7)), 0.022, 0.022, 0.006, x, -0.036, 0.1, 'y', 10); });
  C.rbox(lens(chan('cabDome'), g3(0.7), [4, 2]), 0.16, 0.012, 0.09, 0.004, 0, 2.05, 0.95);
  // MDT screen the game draws on (512 x 320)
  const mdtCanvas = makeCanvas(512, 320), mx = mdtCanvas.getContext('2d');
  mx.fillStyle = '#0b1622'; mx.fillRect(0, 0, 512, 320); mx.strokeStyle = '#1d3a52'; mx.lineWidth = 1; for (let i = 0; i < 12; i++) { mx.beginPath(); mx.moveTo(i * 46, 40); mx.lineTo(i * 46 + 60, 320); mx.stroke(); mx.beginPath(); mx.moveTo(0, 60 + i * 30); mx.lineTo(512, 40 + i * 34); mx.stroke(); }
  mx.fillStyle = '#12283a'; mx.fillRect(0, 0, 512, 34); mx.fillStyle = '#cfe6f7'; mx.font = FONT(18, 700); mx.textBaseline = 'middle'; mx.fillText('KETTER COUNTY CAD', 12, 18); mx.textAlign = 'right'; mx.fillText('MEDIC 14  AVAILABLE', 500, 18);
  const mdtTexture = canvasTex(mdtCanvas, { wrap: false, mip: false, aniso: 4 });
  const cabTexMat = new THREE.MeshStandardMaterial({ map: cs.tex, emissiveMap: cs.tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  const mdtMat = new THREE.MeshStandardMaterial({ map: mdtTexture, emissiveMap: mdtTexture, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.25 });
  const cabSurf = makeSurfMat({ lamps, wet: false, fill: 0.5 });

  // ---- materials, meshes, hierarchy
  const livery = drawAmbLivery(S), map = canvasTex(livery, { wrap: false, aniso: 16 }), grime = ambGrimeTex(seed, livery);
  const normalMap = canvasTex(heightToNormalCanvas(drawAmbLivery(0.5, true, seed), 0.02), { srgb: false, wrap: false, aniso: 8 });
  const grimeU = { value: BASE_DIRT * 0.9 };
  const paintMat = makePaintMat({ map, grime, normalMap, vinyl: true }), surfMat = makeSurfMat({ lamps, grime: grimeU }), glassMat = makeGlassMat();
  paintMat.userData.u.uDirt.value = BASE_DIRT;
  const mirrorMat = new THREE.MeshStandardMaterial({ map: drawMirrorSheet(), metalness: 1, roughness: 0.04, envMapIntensity: 1.25 });
  const mats = { paint: paintMat, surf: surfMat, glass: glassMat, tex: dec.mat, dry: cabSurf, texmirror: mirrorMat };
  const pivots = { doorL: [A.cabW, 0, A.cabDoor[0]], rearL: [rd.x, 0, zR], rearR: [-rd.x, 0, zR], sideDoor: [-A.modW, 0, A.sideDoor[0]] };
  const parts = B.build(mats, pivots);
  const group = new THREE.Group(), body = new THREE.Group(); group.name = 'ambulance'; body.name = 'body'; group.add(body);
  for (const m of parts['']) body.add(m);
  const hinge = {};
  for (const k of Object.keys(pivots)) { const h = hinge[k] = new THREE.Group(); h.name = k; h.position.fromArray(pivots[k]); for (const m of parts[k] || []) h.add(m); body.add(h); }
  const glow = makeGlow(lamps, glows); body.add(glow);
  const crack = new THREE.Group(); crack.visible = false; for (const m of parts.crack) crack.add(m); body.add(crack);
  const cab = new THREE.Group(), cparts = C.build({ dry: cabSurf, texcab: cabTexMat, texmdt: mdtMat }, { doorL: pivots.doorL }, { shadow: false }); cab.name = 'cab'; body.add(cab);
  for (const m of cparts['']) cab.add(m); for (const m of cparts.doorL || []) hinge.doorL.add(m);
  const wheel = new THREE.Group(), wheelHolder = new THREE.Group(); wheelHolder.applyMatrix4(faceMatrix(...pw, pw[0] + wn[0], pw[1] + wn[1], pw[2] + wn[2])); for (const m of cparts.wheel) wheel.add(m); wheelHolder.add(wheel); cab.add(wheelHolder);
  const clusterM = faceMatrix(...pc, ...eye), needles = [-0.0897, 0.0897].map(x => { const h = new THREE.Group(), nd = new THREE.Group(); h.applyMatrix4(clusterM); nd.position.set(x, -0.0016, 0.002); for (const m of cparts.needle) nd.add(m.clone()); h.add(nd); cab.add(h); return nd; });
  const gauges = { setSpeed(kmh) { needles[0].rotation.z = rad(135 - 270 * clamp(kmh / 200)); }, setRpm(v) { needles[1].rotation.z = rad(135 - 270 * clamp(v)); } };
  gauges.setSpeed(0); gauges.setRpm(0.14);
  // wipers: holder aligned with the glass (local Z = glass normal, local X towards the passenger side), arm swings about Z
  const wipers = [], gn = new THREE.Vector3(0, 0.713, 0.701).normalize(), bx = new THREE.Vector3(-1, 0, 0), by = new THREE.Vector3().crossVectors(gn, bx);
  for (const p of [[0.6, A.belt + 0.03, 2.085], [-0.1, A.belt + 0.03, 2.14]]) {
    const h = new THREE.Group(); h.position.fromArray(p); h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, gn));
    const arm = new THREE.Group(); for (const m of parts.wiper) arm.add(m.clone()); h.add(arm); body.add(h); wipers.push(arm);
  }
  // wheels
  const wspec = { R: A.R, W: A.tyreW, rimR: A.rimR, seg: 40, lugs: 8 }, wheels = [], steer = [];
  for (const s of [1, -1]) { const p = new THREE.Group(); p.position.set(s * A.trackF, A.R, A.zF); const w = makeWheel(surfMat, { ...wspec, style: 'front' }, s); p.add(w); group.add(p); steer.push(p); wheels.push(w); }
  for (const s of [1, -1]) { const w = makeWheel(surfMat, { ...wspec, style: 'rear' }, s, A.dualGap); w.position.set(s * A.dualOut, A.R, A.zR); group.add(w); wheels.push(w); }

  // anchors: +Z of each marker is the way its light points
  const anchors = {}, anchor = (n, x, y, z, ry = 0, rx = 0) => { const o = anchors[n] = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); o.rotation.set(rx, ry, 0, 'YXZ'); body.add(o); };
  anchor('headL', 0.7, 1.0, zf + 0.06); anchor('headR', -0.7, 1.0, zf + 0.06); anchor('tailL', 0.945, 1.42, zR - 0.05, PI); anchor('tailR', -0.945, 1.42, zR - 0.05, PI);
  anchor('barL', 0.6, barY + 0.2, barZ); anchor('barR', -0.6, barY + 0.2, barZ); anchor('barC', 0, barY + 0.25, barZ);
  anchor('sceneL', A.modW + 0.05, 2.535, -1.84, PI / 2, 0.5); anchor('sceneR', -A.modW - 0.05, 2.535, -1.84, -PI / 2, 0.5); anchor('sceneRear', 0, 2.56, zR - 0.05, PI, 0.6);
  anchor('rearStep', 0, 0.45, -4.3, PI); anchor('sideDoor', -A.modW - 0.4, 0, 0.01, -PI / 2); anchor('exhaust', -1.14, 0.36, -2.78, -PI / 2);
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.set(0.44, 1.82, 1.0); body.add(seat);

  // ---- lights
  const st = { head: 0, brake: false, rev: false, indL: false, indR: false, interior: false, scene: false, emergency: false, wipers: false, wipe: 0, dmg: 0 };
  const setC = (n, c, k) => { const i = CHN[n]; if (i) { lamps[i * 3] = c[0] * k; lamps[i * 3 + 1] = c[1] * k; lamps[i * 3 + 2] = c[2] * k; } };
  const lights = {
    strobe: new THREE.Color(0, 0, 0), strobeL: new THREE.Color(0, 0, 0), strobeR: new THREE.Color(0, 0, 0), state: st, channels: CHN, lamps,
    setHead(m) { st.head = m | 0; }, setBrake(on) { st.brake = !!on; }, setReverse(on) { st.rev = !!on; }, setIndicators(l, r) { st.indL = !!l; st.indR = !!r; },
    setInterior(on) { st.interior = !!on; }, setSceneLights(on) { st.scene = !!on; }, setEmergency(on) { st.emergency = !!on; },
    update(dt, t) {
      const h = st.head, blink = (t * 1.5) % 1 < 0.5 ? 1 : 0, crack = st.dmg > 0.35 ? 0.12 : 1;
      setC('headL', E_WHT, h ? 7 : 0); setC('headR', E_WHT, h ? 7 * crack : 0); setC('mainL', E_WHT, h === 2 ? 9 : h ? 0.4 : 0); setC('mainR', E_WHT, (h === 2 ? 9 : h ? 0.4 : 0) * crack);
      setC('markA', E_AMB, h ? 2.2 : 0); setC('markR', E_RED, h ? 2 : 0); setC('fog', E_WHT, h ? 3 : 0); setC('tail', E_RED, (h ? 1.2 : 0) + (st.brake ? 6 : 0)); setC('rev', E_WHT, st.rev ? 5 : 0); setC('plate', E_WHT, h ? 1.6 : 0);
      setC('indL', E_AMB, st.indL && blink ? 6 : 0); setC('indR', E_AMB, st.indR && blink ? 6 : 0);
      setC('interior', E_COOL, st.interior ? 3.5 : 0); setC('cabDome', E_WHT, st.interior ? 2 : 0); setC('gauge', [1, 0.3, 0.08], 1.6); for (const n of ['sceneL', 'sceneR', 'sceneB']) setC(n, E_COOL, st.scene ? 7 : 0);
      const S0 = lights.strobe.setRGB(0, 0, 0), SL = lights.strobeL.setRGB(0, 0, 0), SR = lights.strobeR.setRGB(0, 0, 0);
      for (const [n, c, side, per, ph, nf, w] of EMERGENCY) {
        const v = st.emergency ? burst(t, per, ph, nf) : 0; setC(n, c, v * 7);
        if (v) { S0.r += c[0] * w; S0.g += c[1] * w; S0.b += c[2] * w; const T = side > 0 ? SL : side < 0 ? SR : null; if (T) { T.r += c[0] * w; T.g += c[1] * w; T.b += c[2] * w; } else { SL.r += c[0] * w * 0.5; SL.g += c[1] * w * 0.5; SL.b += c[2] * w * 0.5; SR.r += c[0] * w * 0.5; SR.g += c[1] * w * 0.5; SR.b += c[2] * w * 0.5; } }
      }
      S0.multiplyScalar(0.4); SL.multiplyScalar(0.5); SR.multiplyScalar(0.5);
      // wipers finish their stroke before parking
      if (st.wipers || st.wipe > 0) { st.wipe += dt / 1.25; if (st.wipe >= 1) st.wipe = st.wipers ? st.wipe - 1 : 0; }
      const a = -(0.5 - 0.5 * Math.cos(st.wipe * TAU)) * 1.55; for (const w of wipers) w.rotation.z = a;
      cabU?.(dt, t);
    },
  };
  let cabU = null;
  const doors = {
    setRear(t) { hinge.rearL.rotation.y = -t * 1.85; hinge.rearR.rotation.y = t * 1.85; }, setSide(t) { hinge.sideDoor.rotation.y = t * 1.45; }, setDriver(t) { hinge.doorL.rotation.y = -t * 1.15; },
  };
  const out = {
    group, body, wheels, steer, seat, anchors, lights, doors, hinge, cab, gauges, wheel, mdtCanvas, mdtTexture,
    dims: { length: 7.3, width: 2.4, height: 2.9, wheelbase: 4.0, track: A.trackF * 2, frontOverhang: 0.86, rearOverhang: 2.45, wheelRadius: A.R, mass: 6200, cgHeight: 1.05 },
    setWipers(on) { st.wipers = !!on; }, setDirt(v) { const d = BASE_DIRT + (1 - BASE_DIRT) * clamp(v); paintMat.userData.u.uDirt.value = d; grimeU.value = d * 0.9; }, setDamage(v) { st.dmg = clamp(v); paintMat.userData.u.uDamage.value = st.dmg; crack.visible = st.dmg > 0.35; },
    materials: mats, tris: B.tris(),
  };
  lights.update(0, 0);
  return out;
}
