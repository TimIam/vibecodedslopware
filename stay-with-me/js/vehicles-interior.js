// The patient compartment (back of the ambulance) as a closed room: where the patient is treated on the way in.
//
// Layout (origin on the floor at the centre, +Z towards the cab, +X = street side): street side has the tall rear
// cabinet, the CPR seat, the open kit bay under the counter, the action wall (suction, oxygen, controls, sharps,
// gloves) and the overhead cabinets; curb side has the squad bench, its window and locker, and the side door; the
// bulkhead carries the attendant seat, the pass-through to the cab and two more cabinets.
// Five draw calls plus the cot: `dry` (vertex-attributed surfaces, with a baked shading atlas on the six room faces),
// the label sheet, the floor (speckled safety vinyl done in the shader), the windows and the acrylic doors.
// Tuning: light levels in `setLights`, wall tones in the skins at the top of buildAmbulanceInterior, the baked shading
// in drawShade, every printed thing in drawSheet.

import * as THREE from 'three';
import { U } from './gfx.js';
import { makeRng, clamp, makeCanvas, canvasTex, TAU, fbm2 } from './util.js';
import { g3, rad, skin, SK, surf, lens, Builder, faceMatrix, makeSurfMat, FONT, groupOf, FX, withFx } from './vehicles-kit.js';
import { buildStretcher } from './vehicles-gear.js';

const L = 3.6, W = 2.2, Hh = 1.75, hl = L / 2, hw = W / 2;

// ---------------------------------------------------------------------------------------------- printed things

const LABELS = ['AIRWAY', 'IV / MEDS', 'TRAUMA', 'PEDIATRIC', 'BURN / OB', 'LINEN', 'SPLINTS', 'PPE', 'BLS SUPPLIES', 'CARDIAC', 'SUCTION / O2', 'WASTE', 'OB KIT', 'RESTRAINTS', 'BACKBOARDS', 'DRUG BOX'];
function drawSheet(seed) {
  const cv = makeCanvas(2048, 1024), c = cv.getContext('2d'), uv = {}, lit = [], rng = makeRng(seed + 5);
  const rect = (name, x, y, w, h, glow = 0) => { uv[name] = [x / 2048, 1 - (y + h) / 1024, (x + w) / 2048, 1 - y / 1024]; if (glow) lit.push([x, y, w, h, glow]); };
  const txt = (s, x, y, px, col = '#e8ecee', w = 700, al = 'center', sp = 0) => { c.fillStyle = col; c.font = FONT(px, w); c.letterSpacing = sp + 'px'; c.textAlign = al; c.textBaseline = 'middle'; c.fillText(s, x, y); c.letterSpacing = '0px'; };
  const box = (x, y, w, h, col, r = 0) => { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const ring = (x, y, r, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); };
  const bio = (x, y, r, col) => { c.strokeStyle = col; c.lineWidth = r * 0.2; for (let k = 0; k < 3; k++) { const a = k / 3 * TAU - Math.PI / 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.42, a - 2.2, a + 2.2); c.stroke(); } c.fillStyle = col; c.beginPath(); c.arc(x, y, r * 0.14, 0, TAU); c.fill(); ring(x, y, r * 0.3, col, r * 0.1); };
  c.fillStyle = '#d9dad6'; c.fillRect(0, 0, 2048, 1024);
  // module control panel: rocker legends with pilot lights, status display
  rect('panel', 0, 0, 692, 330); box(0, 0, 692, 330, '#141618'); c.strokeStyle = '#6f757a'; c.lineWidth = 3; c.strokeRect(5, 5, 682, 320); txt('MODULE CONTROL', 240, 26, 17, '#aab2b8', 700, 'center', 3);
  ['DOME HI', 'DOME LO', 'EXAM', 'SUCTION', 'EXHAUST', 'HEAT', 'A/C', 'O2 MAIN', 'INVERTER', 'REAR LOAD'].forEach((l, i) => {
    const x = 62 + (i % 5) * 88, y = 100 + (i / 5 | 0) * 140, on = [0, 3, 7, 8].includes(i);
    box(x - 30, y - 44, 60, 88, '#060708', 5); box(x - 17, y - 39, 34, 11, on ? '#ff4a2a' : '#3a1410', 3); if (on) lit.push([x - 19, y - 41, 38, 15, 1]);
    txt(l, x, y + 57, 13, '#cfd6da', 700);
  });
  box(476, 48, 196, 150, '#03090c', 6); lit.push([476, 48, 196, 150, 0.9]); c.strokeStyle = '#2a3238'; c.lineWidth = 3; c.strokeRect(476, 48, 196, 150);
  txt('CABIN', 488, 70, 14, '#79e0c0', 600, 'left'); txt('21.5°C', 662, 70, 20, '#c8fff0', 700, 'right'); txt('O2 MAIN', 488, 104, 14, '#79e0c0', 600, 'left'); txt('1450 psi', 662, 104, 18, '#c8fff0', 700, 'right');
  box(488, 122, 174, 10, '#12302a'); box(488, 122, 120, 10, '#39d6a0'); txt('BATT 13.8 V', 488, 152, 14, '#79e0c0', 600, 'left'); txt('14:32', 662, 152, 18, '#c8fff0', 700, 'right'); txt('SHORE  OFF      INV  ON', 574, 180, 12, '#5aa893', 600);
  for (const [x, l] of [[520, 'FAN'], [628, 'TEMP']]) { ring(x, 262, 30, '#3a4046', 3); txt(l, x, 310, 13, '#cfd6da', 700); for (let k = 0; k < 7; k++) { const a = rad(210 - k * 40); c.strokeStyle = '#aab2b8'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + Math.cos(a) * 34, 262 - Math.sin(a) * 34); c.lineTo(x + Math.cos(a) * 40, 262 - Math.sin(a) * 40); c.stroke(); } }
  // signs
  rect('nosmoke', 700, 0, 520, 110); box(700, 0, 520, 110, '#a81410', 8); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.roundRect(707, 7, 506, 96, 5); c.stroke(); ring(760, 55, 30, '#fff', 6); c.beginPath(); c.moveTo(739, 34); c.lineTo(781, 76); c.stroke(); box(745, 50, 30, 9, '#fff'); txt('NO SMOKING', 1005, 38, 38, '#fff', 700, 'center', 3); txt('OXYGEN IN USE', 1005, 80, 26, '#fff', 600, 'center', 4);
  rect('o2', 700, 120, 250, 90); box(700, 120, 250, 90, '#1c7a2c', 6); txt('OXYGEN', 825, 166, 44, '#fff', 700, 'center', 4);
  rect('suction', 960, 120, 260, 90); box(960, 120, 260, 90, '#ecebe6', 6); c.strokeStyle = '#333'; c.lineWidth = 3; c.strokeRect(965, 125, 250, 80); txt('SUCTION', 1090, 166, 42, '#1c1c1c', 700, 'center', 4);
  rect('outlet', 1230, 0, 150, 230); box(1230, 0, 150, 230, '#ecebe6'); for (const y of [62, 168]) { box(1262, y - 44, 86, 88, '#d2d1cb', 18); c.fillStyle = '#1a1a1a'; c.fillRect(1284, y - 24, 8, 28); c.fillRect(1318, y - 24, 8, 28); c.beginPath(); c.arc(1305, y + 22, 8, 0, TAU); c.fill(); } c.fillStyle = '#9a9a94'; c.beginPath(); c.arc(1305, 115, 5, 0, TAU); c.fill();
  rect('sharps', 1390, 0, 230, 230); box(1390, 0, 230, 230, '#f2f0e8', 6); box(1398, 8, 214, 132, '#e0641a', 4); bio(1505, 74, 56, '#111'); txt('BIOHAZARD', 1505, 162, 30, '#111', 700, 'center', 3); txt('SHARPS ONLY · DO NOT OVERFILL', 1505, 196, 13.5, '#111', 700); txt('FILL LINE ▶', 1505, 216, 12, '#a81410', 700);
  rect('ext', 1630, 0, 230, 330); box(1630, 0, 230, 330, '#f2f2ee'); box(1630, 0, 230, 70, '#a81410'); txt('FIRE', 1745, 24, 30, '#fff', 700, 'center', 5); txt('EXTINGUISHER', 1745, 54, 19, '#fff', 700, 'center', 2); txt('ABC', 1745, 112, 54, '#a81410', 700, 'center', 4); txt('DRY CHEMICAL  2.5 kg', 1745, 158, 16, '#222', 700);
  ['PULL PIN', 'AIM AT BASE', 'SQUEEZE', 'SWEEP'].forEach((l, i) => { box(1650, 184 + i * 34, 26, 26, '#1d2a44', 13); txt(String(i + 1), 1663, 198 + i * 34, 16, '#fff'); txt(l, 1688, 198 + i * 34, 16, '#222', 700, 'left'); });
  rect('warn', 1870, 0, 170, 230); box(1870, 0, 170, 230, '#e8b400', 6); c.fillStyle = '#111'; c.beginPath(); c.moveTo(1955, 16); c.lineTo(2010, 110); c.lineTo(1900, 110); c.closePath(); c.fill(); txt('!', 1955, 76, 60, '#e8b400'); txt('CAUTION', 1955, 136, 26, '#111', 700, 'center', 2); txt('SECURE ALL', 1955, 168, 16, '#111', 700); txt('EQUIPMENT BEFORE', 1955, 188, 14, '#111', 700); txt('MOVING', 1955, 208, 16, '#111', 700);
  // glove boxes
  ['S', 'M', 'L'].forEach((l, i) => { const x = 700 + i * 176, col = ['#5b3f96', '#2b62a8', '#1f7d7a'][i]; rect('glove' + i, x, 240, 170, 86); box(x, 240, 170, 86, '#f1f1ec'); box(x, 240, 170, 26, col); txt('NITRILE EXAM GLOVES', x + 85, 254, 12.5, '#fff', 700, 'center', 1); c.fillStyle = '#0b0b0c'; c.beginPath(); c.ellipse(x + 62, 294, 50, 20, 0, 0, TAU); c.fill(); txt(l, x + 142, 292, 44, col); txt('100 ct', x + 142, 318, 11, '#444'); });
  // cabinet labels
  LABELS.forEach((l, i) => { const x = (i % 4) * 256, y = 340 + (i / 4 | 0) * 46; rect('lab' + i, x, y, 250, 40); box(x, y, 250, 40, '#f4f4f0', 4); c.strokeStyle = '#1b2f55'; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x + 3, y + 3, 244, 34, 3); c.stroke(); txt(l, x + 125, y + 21, 25, '#1b2f55', 700, 'center', 1.5); });
  // clock, vacuum gauge, flowmeter scale
  rect('clock', 1040, 340, 200, 200); box(1040, 340, 200, 200, '#17181a'); c.fillStyle = '#f4f4f0'; c.beginPath(); c.arc(1140, 440, 90, 0, TAU); c.fill(); for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, b = i % 5 === 0; c.strokeStyle = '#222'; c.lineWidth = b ? 4 : 1.5; c.beginPath(); c.moveTo(1140 + Math.cos(a) * (b ? 72 : 79), 440 + Math.sin(a) * (b ? 72 : 79)); c.lineTo(1140 + Math.cos(a) * 84, 440 + Math.sin(a) * 84); c.stroke(); }
  for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU - Math.PI / 2; txt(String(i), 1140 + Math.cos(a) * 58, 441 + Math.sin(a) * 58, 19, '#222'); } c.strokeStyle = '#111'; c.lineCap = 'round'; c.lineWidth = 6; c.beginPath(); c.moveTo(1140, 440); c.lineTo(1166, 412); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(1140, 440); c.lineTo(1124, 376); c.stroke(); c.strokeStyle = '#b01712'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(1140, 440); c.lineTo(1196, 474); c.stroke(); c.lineCap = 'butt';
  rect('gauge', 1250, 340, 200, 200); box(1250, 340, 200, 200, '#b9bcbf'); c.fillStyle = '#f6f6f2'; c.beginPath(); c.arc(1350, 440, 92, 0, TAU); c.fill(); for (const [a0, a1, col] of [[225, 135, '#3a9a4a'], [135, 45, '#e0b020'], [45, -45, '#c83a20']]) { c.strokeStyle = col; c.lineWidth = 9; c.beginPath(); c.arc(1350, 440, 80, -rad(a0), -rad(a1)); c.stroke(); }
  for (let i = 0; i <= 12; i++) { const a = rad(225 - i * 22.5); c.strokeStyle = '#222'; c.lineWidth = i % 2 ? 1.5 : 3.5; c.beginPath(); c.moveTo(1350 + Math.cos(a) * 62, 440 - Math.sin(a) * 62); c.lineTo(1350 + Math.cos(a) * 74, 440 - Math.sin(a) * 74); c.stroke(); if (i % 2 === 0) txt(String(i * 50), 1350 + Math.cos(a) * 46, 440 - Math.sin(a) * 46, 13, '#222'); }
  txt('mmHg', 1350, 484, 14, '#333'); txt('VACUUM', 1350, 406, 12, '#333', 700, 'center', 2); c.strokeStyle = '#b01712'; c.lineWidth = 4; c.beginPath(); c.moveTo(1350, 440); c.lineTo(1296, 402); c.stroke(); c.fillStyle = '#222'; c.beginPath(); c.arc(1350, 440, 7, 0, TAU); c.fill();
  rect('flow', 1460, 340, 60, 200); box(1460, 340, 60, 200, '#f4f4ee'); for (let i = 0; i <= 15; i++) { const y = 530 - i * 12; c.fillStyle = '#1a1a1a'; c.fillRect(1462, y, i % 5 === 0 ? 22 : 12, 2); if (i % 5 === 0) txt(String(i), 1502, y + 1, 15, '#1a1a1a'); } txt('L/min', 1490, 350, 10, '#1c7a2c', 700);
  rect('belt', 1530, 340, 300, 60); box(1530, 340, 300, 60, '#f4f4ee', 4); c.strokeStyle = '#a81410'; c.lineWidth = 3; c.strokeRect(1534, 344, 292, 52); txt('FASTEN SEAT BELTS', 1680, 360, 22, '#a81410', 700, 'center', 1); txt('WHILE VEHICLE IS IN MOTION', 1680, 384, 14, '#222', 700);
  rect('exit', 1530, 410, 180, 70, 0.6); box(1530, 410, 180, 70, '#0f6a2c', 5); txt('EXIT', 1620, 447, 46, '#eafff0', 700, 'center', 8);
  rect('bio', 1720, 410, 120, 120); box(1720, 410, 120, 120, '#e0641a', 6); bio(1780, 462, 44, '#111'); txt('BIOHAZARD', 1780, 518, 13, '#111', 700);
  rect('o2out', 1850, 240, 96, 96); box(1850, 240, 96, 96, '#efeee8', 8); ring(1898, 288, 34, '#1c7a2c', 8); txt('O₂', 1898, 252, 15, '#1c7a2c'); for (const [dx, dy] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) { c.fillStyle = '#8c8c86'; c.beginPath(); c.arc(1898 + dx, 288 + dy, 4, 0, TAU); c.fill(); }
  rect('dial', 1950, 240, 96, 96); box(1950, 240, 96, 96, '#d8d9d6', 8); txt('OFF', 1998, 252, 12, '#222'); txt('INT', 1962, 300, 12, '#222', 700, 'left'); txt('FULL', 2036, 300, 12, '#222', 700, 'right'); ring(1998, 292, 22, '#555', 2);
  // conspicuity tape, hazard edging
  rect('tape', 0, 526, 512, 30); for (let i = 0; i < 8; i++) box(i * 64, 526, 64, 30, i % 2 ? '#e9e7dc' : '#b3120e'); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; for (let i = 0; i < 64; i++) { c.beginPath(); c.moveTo(i * 8, 526); c.lineTo(i * 8 + 8, 556); c.stroke(); }
  rect('hazard', 0, 562, 512, 30); box(0, 562, 512, 30, '#d6a800'); c.save(); c.beginPath(); c.rect(0, 562, 512, 30); c.clip(); c.fillStyle = '#17171a'; for (let i = -2; i < 18; i++) { c.beginPath(); c.moveTo(i * 36, 592); c.lineTo(i * 36 + 18, 592); c.lineTo(i * 36 + 48, 562); c.lineTo(i * 36 + 30, 562); c.fill(); } c.restore();
  // packaged supplies seen through the cabinet doors
  [['#e9e8e2', '#1b4f9a', 'GAUZE 4x4'], ['#1b4f9a', '#fff', 'NS 0.9% 500 mL'], ['#b3261c', '#fff', 'TRAUMA DRSG'], ['#e0a514', '#222', 'OPA / NPA'], ['#2f7d45', '#fff', 'O2 MASK ADULT'], ['#6a3f96', '#fff', 'IV START KIT'], ['#f2f2ee', '#b3261c', 'BVM ADULT'], ['#1f7d7a', '#fff', 'SUCTION CATH']].forEach(([bg, fg, l], i) => {
    const x = i * 190; rect('sup' + i, x, 600, 180, 110); box(x, 600, 180, 110, bg); box(x + 10, 612, 160, 52, fg === '#fff' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.06)', 3); txt(l, x + 90, 640, 20, fg === '#fff' ? bg : fg, 700);
    for (let k = 0; k < 3; k++) box(x + 14, 676 + k * 10, rng.r(60, 150), 4, fg === '#fff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)');
  });
  rect('canister', 1540, 600, 120, 330); box(1540, 600, 120, 330, '#f0f1ee'); for (let i = 1; i <= 12; i++) { const y = 920 - i * 25; c.fillStyle = '#20324a'; c.fillRect(1548, y, i % 2 ? 26 : 44, 3); if (i % 2 === 0) txt(String(i * 100), 1628, y + 2, 19, '#20324a'); } txt('mL', 1628, 612, 14, '#20324a');
  rect('radio', 1680, 600, 200, 260); box(1680, 600, 200, 260, '#101112', 8); for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) { c.fillStyle = '#2c3034'; c.beginPath(); c.arc(1700 + x * 16, 622 + y * 14, 4, 0, TAU); c.fill(); } txt('CAB INTERCOM', 1780, 768, 16, '#aab2b8', 700, 'center', 2); for (const [x, col] of [[1720, '#2f7d45'], [1780, '#3b3f43'], [1840, '#a81410']]) { box(x - 20, 790, 40, 40, col, 6); } lit.push([1700, 790, 40, 40, 0.8]);
  rect('idplate', 0, 730, 380, 96); const g = c.createLinearGradient(0, 730, 0, 826); g.addColorStop(0, '#c9ccce'); g.addColorStop(0.5, '#eceeef'); g.addColorStop(1, '#b6b9bb'); c.fillStyle = g; c.fillRect(0, 730, 380, 96); c.strokeStyle = '#555'; c.lineWidth = 2; c.strokeRect(4, 734, 372, 88); txt('KETTER COUNTY EMS · MEDIC 14', 190, 756, 21, '#1a1a1a', 700, 'center', 1); txt('PATIENT COMPARTMENT   MAX OCCUPANTS 5', 190, 784, 14, '#1a1a1a', 600); txt('GVWR 6 350 kg   KKK-A-1822F   BUILT 03/2021', 190, 806, 12.5, '#333', 600);
  const em = makeCanvas(2048, 1024), e = em.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, 2048, 1024); e.globalAlpha = 0.09; e.drawImage(cv, 0, 0);
  for (const [x, y, w, h, a] of lit) { e.globalAlpha = a; e.drawImage(cv, x, y, w, h, x, y, w, h); }
  return { sheet: canvasTex(cv, { wrap: false, aniso: 16 }), emis: canvasTex(em, { wrap: false, aniso: 4 }), uv };
}

// Baked shading for the six faces of the room (multiplied into the wall colour): contact shadows where furniture
// meets the walls, darker cabinet insides, pools of light on the ceiling, scuffs. 150 px per metre.
const AO = { S: 150, N: 1024, street: [0, 0], curb: [0, 264], front: [0, 528], rear: [331, 528], ceil: [662, 0] };
function drawShade(seed) {
  const N = AO.N, S = AO.S, cv = makeCanvas(N, N), c = cv.getContext('2d'), rng = makeRng(seed + 11);
  c.fillStyle = '#fff'; c.fillRect(0, 0, N, N);
  const face = (name, w, h, fn) => {
    const o = AO[name]; c.save(); c.beginPath(); c.rect(o[0], o[1], w * S, h * S); c.clip(); c.translate(o[0], o[1]); c.scale(S, S); c.fillStyle = name === 'ceil' ? '#e4e4e2' : '#eeeeec'; c.fillRect(0, 0, w, h);
    // u, v in metres from the face's top-left; band = a gradient of black (or white) fading away from one edge of a rectangle
    const band = (x0, y0, x1, y1, from, a, col = '0,0,0') => { const g = from === 't' ? c.createLinearGradient(0, y0, 0, y1) : from === 'b' ? c.createLinearGradient(0, y1, 0, y0) : from === 'l' ? c.createLinearGradient(x0, 0, x1, 0) : c.createLinearGradient(x1, 0, x0, 0); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0); };
    const flat = (x0, y0, x1, y1, a, col = '0,0,0') => { c.fillStyle = `rgba(${col},${a})`; c.fillRect(x0, y0, x1 - x0, y1 - y0); };
    const blob = (x, y, r, a, col = '0,0,0') => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
    fn({ band, flat, blob });
    if (name !== 'ceil') { band(0, h - 0.35, w, h, 'b', 0.3); band(0, 0, w, 0.16, 't', 0.16); band(0, 0, 0.25, h, 'l', 0.2); band(w - 0.25, 0, w, h, 'r', 0.2); for (let i = 0; i < 26; i++) blob(rng.r(0, w), h - rng.r(0, 0.7), rng.r(0.03, 0.14), rng.r(0.03, 0.09)); }
    c.restore();
  };
  // side walls: u = z + hl, v = Hh - y
  face('street', L, Hh, ({ band, flat }) => {
    flat(hl - 0.5, 0, hl + 1.2, Hh - 1.275, 0.42); band(hl - 0.5, Hh - 1.25, hl + 1.2, Hh - 0.95, 't', 0.3, '255,255,255'); band(hl - 0.56, Hh - 0.8, hl + 1.4, Hh - 0.74, 'b', 0.3);
    flat(hl - 0.5, Hh - 0.71, hl + 0.32, Hh, 0.5); band(hl - 0.5, Hh - 0.71, hl + 0.32, Hh - 0.4, 't', 0.3);
    band(hl - 1.2, Hh - 0.6, hl - 0.56, Hh - 0.48, 'b', 0.3); band(hl - 1.2, 0, hl - 1.05, Hh, 'l', 0.2); band(hl - 0.66, Hh - 1.25, hl - 0.5, Hh, 'r', 0.18);
  });
  face('curb', L, Hh, ({ band, flat }) => {
    flat(0, 0, hl + 0.4, Hh - 1.42, 0.42); band(0, Hh - 1.4, hl + 0.4, Hh - 1.22, 't', 0.28); band(0, Hh - 0.6, hl + 0.4, Hh - 0.47, 'b', 0.3);
    band(hl + 0.4, 0, hl + 0.52, Hh, 'l', 0.14); band(hl + 1.3, 0, hl + 1.48, Hh, 'l', 0.16); band(hl + 1.44, 0, L, Hh - 1.15, 'b', 0.25);
  });
  // bulkhead and rear wall: u = x + hw, v = Hh - y
  face('front', W, Hh, ({ band, flat, blob }) => {
    flat(hw + 0.42, 0, W, Hh, 0.42); band(0, Hh - 1.15, hw - 0.48, Hh - 0.98, 't', 0.3); flat(0, 0, hw - 0.48, Hh - 1.15, 0.3);
    blob(hw - 0.1, Hh - 0.7, 0.62, 0.3); band(hw + 0.2, 0, hw + 0.42, Hh, 'r', 0.22);
  });
  face('rear', W, Hh, ({ band }) => {
    for (const s of [1, -1]) { const a = hw + s * 0.012, b = hw + s * 0.66; band(Math.min(a, b), Hh - 1.62, Math.max(a, b), Hh - 1.45, 't', 0.12); band(Math.min(a, b), Hh - 0.5, Math.max(a, b), Hh, 'b', 0.15); }
    band(hw - 0.08, 0, hw, Hh, 'r', 0.22); band(hw, 0, hw + 0.08, Hh, 'l', 0.22); band(hw + 0.6, 0, hw + 0.78, Hh, 'r', 0.2);
  });
  // ceiling: u = x + hw, v = z + hl
  face('ceil', W, L, ({ band, flat, blob }) => {
    for (const x of [-0.42, 0.42]) for (const z of [-1.1, 0, 1.1]) { blob(hw + x, hl + z, 0.62, 0.55, '255,255,255'); }
    band(0, 0, 0.3, L, 'l', 0.22); band(W - 0.3, 0, W, L, 'r', 0.22); band(0, 0, W, 0.25, 't', 0.2); band(0, L - 0.25, W, L, 'b', 0.2);
    flat(hw + 0.76, hl - 0.5, W, hl + 1.2, 0.3); flat(0, 0, 0.32, hl + 0.4, 0.3); blob(hw - 0.75, hl - 1.45, 0.3, 0.16);
    for (const x of [-0.14, 0.26]) { band(hw + x - 0.05, hl - 1.3, hw + x, hl + 1.06, 'r', 0.14); band(hw + x, hl - 1.3, hw + x + 0.05, hl + 1.06, 'l', 0.14); }
  });
  // faint mottling over everything, then the white patch that untextured vertices sample
  const n = makeCanvas(256, 256), nc = n.getContext('2d'), img = nc.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const v = 200 + 55 * fbm2((i & 255) * 0.035, (i >> 8) * 0.035, 4, seed, 9); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  nc.putImageData(img, 0, 0); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.55; c.drawImage(n, 0, 0, N, N); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#fff'; c.fillRect(0, N - 24, 24, 24);
  return canvasTex(cv, { wrap: false, aniso: 4 });
}

// Wear, shadows and markings of the floor (the speckle itself is procedural). u = x, v = z, top of the canvas = cab end.
function drawFloor(seed, cot) {
  const cw = 512, ch = 1024, cv = makeCanvas(cw, ch), c = cv.getContext('2d'), rng = makeRng(seed), X = x => (x + hw) / W * cw, Y = z => (hl - z) / L * ch;
  c.fillStyle = '#6b737b'; c.fillRect(0, 0, cw, ch);
  const blob = (x, z, rx, rz, a, col = '20,20,22') => { const R = Math.max(rx, rz) * cw / W, g = c.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.6, `rgba(${col},${a * 0.6})`); g.addColorStop(1, `rgba(${col},0)`); c.save(); c.translate(X(x), Y(z)); c.scale(rx / Math.max(rx, rz), (rz / Math.max(rx, rz)) * (ch / L) / (cw / W)); c.fillStyle = g; c.fillRect(-R, -R, 2 * R, 2 * R); c.restore(); };
  const grad = (x0, x1, a) => { const g = c.createLinearGradient(X(x0), 0, X(x1), 0); g.addColorStop(0, `rgba(12,12,14,${a})`); g.addColorStop(1, 'rgba(12,12,14,0)'); c.fillStyle = g; c.fillRect(Math.min(X(x0), X(x1)), 0, Math.abs(X(x1) - X(x0)), ch); };
  blob(-0.32, -0.3, 0.26, 1.5, 0.16, '150,155,160'); blob(-0.3, -1.6, 0.9, 0.25, 0.2, '150,155,160'); blob(-0.75, 0.9, 0.4, 0.5, 0.18, '150,155,160');      // traffic polish: aisle, rear step, side door
  grad(-0.6, -0.42, 0.5); grad(0.74, 0.58, 0.5); c.fillStyle = 'rgba(10,10,12,0.5)'; c.fillRect(X(0.74), Y(0.32), X(hw) - X(0.74), Y(-0.5) - Y(0.32)); c.fillRect(X(-hw), 0, X(-0.6) - X(-hw), ch); c.fillRect(X(0.74), 0, cw, Y(0.32));
  { const g = c.createLinearGradient(0, 0, 0, Y(1.3)); g.addColorStop(0, 'rgba(10,10,12,0.45)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.fillStyle = g; c.fillRect(0, 0, cw, Y(1.3)); }
  blob(-0.1, 1.38, 0.32, 0.32, 0.5); if (cot) { blob(0.05, -0.25, 0.4, 1.12, 0.42); for (const z of [-1.13, 0.63]) for (const x of [-0.215, 0.315]) blob(x, z, 0.07, 0.07, 0.5); }
  c.lineCap = 'round'; for (let i = 0; i < 60; i++) { const x = rng.chance(0.6) ? rng.pick([-0.22, 0.32]) + rng.r(-0.03, 0.03) : rng.r(-0.55, 0.6), z = rng.r(-1.75, 0.6), l = rng.r(0.04, 0.3); c.strokeStyle = `rgba(18,18,20,${rng.r(0.1, 0.3)})`; c.lineWidth = rng.r(0.6, 2.2); c.beginPath(); c.moveTo(X(x), Y(z)); c.lineTo(X(x + rng.r(-0.02, 0.02)), Y(z + l)); c.stroke(); }
  for (let i = 0; i < 40; i++) blob(rng.r(-1, 1), rng.r(-1.8, 1.8), rng.r(0.02, 0.08), rng.r(0.02, 0.08), rng.r(0.05, 0.14), rng.chance(0.3) ? '160,160,160' : '20,20,22');
  c.fillStyle = '#c59a00'; c.fillRect(X(-0.66), Y(-1.63), X(0.66) - X(-0.66), Y(-1.68) - Y(-1.63));
  return canvasTex(cv, { wrap: false, aniso: 8 });
}

// The canvases are drawn once per seed and shared by every build of the room (the game rebuilds it on each visit).
const _tex = new Map();
const shared = (key, fn) => { let t = _tex.get(key); if (!t) _tex.set(key, t = fn()); return t; };

// ---------------------------------------------------------------------------------------------- materials

// Safety vinyl: the map is sampled by position (so the coved edges carry on from the floor), chips and grit are hashed.
function makeFloorMat(map) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.52 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvFP=position;\n#ifdef USE_MAP\nvMapUv=vec2(position.x/${W.toFixed(2)}+0.5,position.z/${L.toFixed(2)}+0.5);\n#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vFP; float flG=0.0; vec2 flV=vec2(0.0);
      float flH(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 q=vFP.xz+vFP.y*vec2(0.71,0.29); float fw=fwidth(q.x)+fwidth(q.y), f1=1.0-smoothstep(0.0012,0.005,fw), f2=1.0-smoothstep(0.004,0.014,fw);
          float a=flH(floor(q*620.0)), b=flH(floor(q*250.0)+7.3), d=flH(floor(q*1500.0)+3.1);
          diffuseColor.rgb*=1.0+(step(0.9,a)*0.5-step(a,0.1)*0.42)*f1+(step(0.94,b)*0.4-step(b,0.06)*0.38)*f2+(d-0.5)*0.12*f1;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.5,0.62,0.78)*diffuseColor.g*1.6,step(0.965,b)*f2*0.6);
          flG=(a-0.5)*f1; flV=vec2(a-0.5,d-0.5)*f1; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+flG*0.3,0.08,1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(flV.x,0.0,flV.y)*0.09);');
  };
  m.customProgramCacheKey = () => 'vhfloor';
  return m;
}
// Privacy-tinted windows seen from inside: daylight or the street at night as a soft blur (follows U.uNight / uRain).
function makeWindowMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0x030405, roughness: 0.07 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uNight: U.uNight, uRain: U.uRain });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWUv; varying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWUv=uv; vWP=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vWUv; varying vec3 vWP; uniform float uNight,uRain;
      float wnB(vec2 u, vec2 c, float r){ vec2 d=(u-c)/r; return exp(-dot(d,d)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec2 u=vWUv; float k=fract(sin(dot(floor(vWP.xz*2.0+vWP.y),vec2(12.9898,78.233)))*43758.5453), sx=u.x+k*0.7;
          vec3 day=mix(vec3(0.34,0.37,0.38),vec3(0.62,0.7,0.8),smoothstep(0.3,0.78,u.y+0.06*sin(sx*9.0)))*(0.95-0.3*uRain);
          day*=1.0-0.26*(1.0-smoothstep(0.34,0.56,u.y+0.03*sin(sx*17.0+1.7)+0.05*sin(sx*6.0)));
          vec3 night=vec3(0.004,0.006,0.011)+vec3(1.0,0.55,0.2)*(wnB(u,vec2(0.25+k*0.3,0.62),0.13)*0.22+wnB(u,vec2(0.8-k*0.2,0.55),0.09)*0.14)+vec3(0.5,0.7,1.0)*wnB(u,vec2(0.55,0.36),0.2)*0.035;
          totalEmissiveRadiance+=mix(day,night,clamp(uNight,0.0,1.0)); }`);
  };
  m.customProgramCacheKey = () => 'vhwindow';
  return m;
}

// ---------------------------------------------------------------------------------------------- the room

// The patient compartment as a closed room (3.6 x 2.2 x 1.75 m). Frame: origin on the floor at the centre,
// +Z towards the cab, +X = street side. Camera markers point along their +Z. opts: seed, stretcher, lights.
export function buildAmbulanceInterior(opts = {}) {
  const PI = Math.PI, seed = opts.seed ?? 14, cot = opts.stretcher !== false, lamps = new Float32Array(4 * 3), sh = shared('sheet' + seed, () => drawSheet(seed)), rng = makeRng(seed * 3 + 1);
  const B = new Builder({ seg: 3, single: sk => sk.mat === 'tex' ? 'dry' : sk.mat.startsWith('tex') || sk.mat === 'acrylic' ? sk.mat : 'dry' });
  const WALL = withFx(skin('tex', [0.71, 0.72, 0.71], 0.52), FX.grain), DOOR = withFx(skin('tex', [0.74, 0.75, 0.75], 0.42), FX.grain);
  const CAB = withFx(surf([0.69, 0.7, 0.69], 0.45), FX.grain), CABD = withFx(surf([0.76, 0.77, 0.76], 0.36), FX.grain), CABK = surf(g3(0.05), 0.7), TOP = withFx(surf([0.13, 0.14, 0.15], 0.34), FX.grain);
  const CUSH = withFx(surf([0.036, 0.05, 0.078], 0.5), FX.weave, 0.0011), CUSHD = withFx(surf([0.022, 0.03, 0.048], 0.55), FX.weave, 0.0011), BLK = withFx(SK.black, FX.grain), GLOSS = SK.gloss;
  const ALU = withFx(SK.alu, FX.brushed), ALUV = withFx(SK.alu, FX.brushed, 1), STL = withFx(surf(g3(0.6), 0.3, 0.55), FX.brushed, 1), DIA = withFx(surf(g3(0.5), 0.36, 0.55), FX.diamond), RUB = SK.rubber, MATR = withFx(surf(g3(0.03), 0.8), FX.ribbed);
  const YEL = surf(0xd9a400, 0.34), RED = surf(0xa81410, 0.4), GRN = surf(0x1c7a2c, 0.35), WHT = surf(g3(0.78), 0.4), WEB = withFx(surf(g3(0.03), 0.9), FX.weave, 0.0026), PERF = withFx(surf(g3(0.42), 0.5, 0.25), FX.perf, 0.008), PIPE = surf([0.014, 0.02, 0.034], 0.6), SEAM = surf(g3(0.09), 0.8);
  const SKL = skin('texsheet'), SKFL = skin('texfloor'), SKWIN = skin('texwin'), ACR = skin('acrylic'), DOME = lens(1, g3(0.86), [5, 17]), STRIP = lens(1, g3(0.86), [2, 64]), PILOT = lens(2, [0.1, 0.5, 0.2]);
  const SUP = [[0.75, 0.75, 0.72], [0.1, 0.22, 0.5], [0.55, 0.1, 0.08], [0.75, 0.5, 0.1], [0.15, 0.4, 0.22], [0.36, 0.2, 0.5], [0.8, 0.8, 0.76], [0.1, 0.36, 0.38]].map(c => surf(c, 0.6));
  // box by extents (r > 0 rounds the edges); label / plate from the sheet; wall quads carry the shading atlas
  const bx = (sk, x0, x1, y0, y1, z0, z1, r = 0) => r ? B.rbox(sk, x1 - x0, y1 - y0, z1 - z0, r, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) : B.box(sk, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const label = (name, w, x, y, z, ry = 0, rx = 0, h = 0) => { const r = sh.uv[name]; h ||= w * (r[3] - r[1]) / (r[2] - r[0]) * 0.5; B.at(x, y, z, rx, ry, 0, () => B.plane(SKL, w, h, 0, 0, 0, r)); };
  const wq = (face, sk, a0, a1, b0, b1, off = 0) => {
    const w = a1 - a0, h = b1 - b0, ca = (a0 + a1) / 2, cb = (b0 + b1) / 2, o = AO[face], side = face === 'street' || face === 'curb';
    const Uf = a => (o[0] + (a + (side ? hl : hw)) * AO.S) / AO.N, Vf = b => 1 - (o[1] + (face === 'ceil' ? b + hl : Hh - b) * AO.S) / AO.N;
    if (face === 'street') B.at(hw - off, cb, ca, 0, -PI / 2, 0, () => B.plane(sk, w, h, 0, 0, 0, [Uf(a0), Vf(b0), Uf(a1), Vf(b1)]));
    else if (face === 'curb') B.at(-hw + off, cb, ca, 0, PI / 2, 0, () => B.plane(sk, w, h, 0, 0, 0, [Uf(a1), Vf(b0), Uf(a0), Vf(b1)]));
    else if (face === 'front') B.at(ca, cb, hl - off, 0, PI, 0, () => B.plane(sk, w, h, 0, 0, 0, [Uf(a1), Vf(b0), Uf(a0), Vf(b1)]));
    else if (face === 'rear') B.at(ca, cb, -hl + off, 0, 0, 0, () => B.plane(sk, w, h, 0, 0, 0, [Uf(a0), Vf(b0), Uf(a1), Vf(b1)]));
    else B.at(ca, Hh - off, cb, PI / 2, 0, 0, () => B.plane(sk, w, h, 0, 0, 0, [Uf(a0), Vf(b0), Uf(a1), Vf(b1)]));
  };
  // hardware in a frame whose +Z points out of the surface it sits on
  const on = (x, y, z, ry, fn) => B.at(x, y, z, 0, ry, 0, fn), FX_ = -PI / 2, FXp = PI / 2;     // ry for a surface facing -X / +X
  const latch = () => { B.rbox(BLK, 0.105, 0.075, 0.005, 0.002, 0, 0, 0.0025); B.rbox(STL, 0.075, 0.046, 0.009, 0.003, 0, -0.002, 0.007); };
  const pull = (w = 0.12) => B.tube(ALU, [[-w / 2, 0, 0], [-w / 2, 0, 0.026], [w / 2, 0, 0.026], [w / 2, 0, 0]], 0.0055, 6);
  const hinges = (x, y0, y1, z, axisX) => { for (const t of [0.12, 0.88]) B.cyl(STL, 0.007, 0.007, 0.075, x, y0 + (y1 - y0) * t, z, 'y', 8); };
  const gasket = (ry, w, h, t = 0.022) => { B.rbox(RUB, w + t, t, 0.012, 0.004, 0, h / 2, 0.004); B.rbox(RUB, w + t, t, 0.012, 0.004, 0, -h / 2, 0.004); B.rbox(RUB, t, h, 0.012, 0.004, w / 2, 0, 0.004); B.rbox(RUB, t, h, 0.012, 0.004, -w / 2, 0, 0.004); };
  // welded seam around a cushion slab lying in the local XZ plane (w along X, d along Z), at local y = 0
  const piping = (w, d, c = 0.03) => { const a = w / 2 + 0.002, b = d / 2 + 0.002; B.tube(PIPE, [[a, 0, -b + c], [a, 0, b - c], [a - c, 0, b], [c - a, 0, b], [-a, 0, b - c], [-a, 0, -b + c], [c - a, 0, -b], [a - c, 0, -b]], 0.0045, 4, { loop: true }); };
  // supplies on a shelf: alongZ shelves face +-X, others face -Z; front = the plane the packs line up on, dir = which way the shelf goes back
  const stock = (alongZ, lo, hi, y0, ymax, front, dir) => {
    let p = lo + 0.012;
    for (let n = 0; n < 40; n++) {
      const w = rng.r(0.075, 0.17), h = Math.min(ymax, rng.r(0.09, ymax + 0.04)), d = rng.r(0.14, 0.24), k = rng.i(0, 7); if (p + w > hi - 0.012) break;
      const cp = p + w / 2, f = front + dir * (0.014 + rng.r(0, 0.02)), dc = f + dir * d / 2, lw = w * 0.94, lh = Math.min(h * 0.86, lw * 0.61);
      if (alongZ) { B.box(SUP[k], d, h, w, dc, y0 + h / 2, cp); label('sup' + k, lw, f - dir * 0.001, y0 + h * 0.52, cp, dir > 0 ? FX_ : FXp, 0, lh); }
      else { B.box(SUP[k], w, h, d, cp, y0 + h / 2, dc); label('sup' + k, lw, cp, y0 + h * 0.52, f - dir * 0.001, PI, 0, lh); }
      p += w + rng.r(0.004, 0.03);
    }
  };
  // a pair of sliding acrylic panes in aluminium tracks, across [lo, hi] on a cabinet face (alongZ: face at x = f looking dir)
  const sliders = (alongZ, lo, hi, y0, y1, f, dir, lab) => {
    const mid = (lo + hi) / 2, pw = (hi - lo) / 2 + 0.015, ph = y1 - y0 - 0.05, yc = (y0 + y1) / 2;
    for (const [k, c0] of [[0, lo + pw / 2 + 0.004], [1, hi - pw / 2 - 0.004]]) {
      const fp = f - dir * (0.006 + k * 0.011), pe = k ? c0 - pw / 2 + 0.03 : c0 + pw / 2 - 0.03;
      if (alongZ) { B.box(ACR, 0.005, ph, pw, fp, yc, c0); bx(ALUV, fp - 0.007, fp + 0.007, yc - 0.1, yc + 0.1, pe - 0.006, pe + 0.006, 0.003); }
      else { B.box(ACR, pw, ph, 0.005, c0, yc, fp); bx(ALUV, pe - 0.006, pe + 0.006, yc - 0.1, yc + 0.1, fp - 0.007, fp + 0.007, 0.003); }
    }
    for (const [ya, yb] of [[y0, y0 + 0.028], [y1 - 0.034, y1]]) { if (alongZ) bx(ALU, Math.min(f - dir * 0.026, f + dir * 0.006), Math.max(f - dir * 0.026, f + dir * 0.006), ya, yb, lo, hi, 0.004); else bx(ALU, lo, hi, ya, yb, f - 0.026, f + 0.006, 0.004); }
    if (lab != null) { if (alongZ) label('lab' + lab, 0.2, f - dir * 0.0275, y1 - 0.017, mid, dir > 0 ? FX_ : FXp, 0, 0.03); else label('lab' + lab, 0.2, mid, y1 - 0.017, f - 0.0275, PI, 0, 0.03); }
  };

  // ---- shell: floor with coved edges, walls, ceiling
  B.at(0, 0, 0, -PI / 2, 0, 0, () => B.plane(SKFL, W, L));
  B.mirror(() => B.sweep(SKFL, [[hw, 0, -hl], [hw, 0, hl]], [{ a: 0, b: 0, r: 0 }, { a: 0.075, b: 0, r: 0 }, { a: 0.02, b: 0.02, flat: true }, { a: 0, b: 0.075, r: 0 }], { caps: false }));
  wq('street', WALL, -hl, hl, 0, Hh); wq('ceil', WALL, -hw, hw, -hl, hl);
  for (const [a0, a1, b0, b1] of [[-hl, -1.0, 0, Hh], [-1.0, 0.1, 0, 0.98], [-1.0, 0.1, 1.33, Hh], [0.1, 0.5, 0, Hh], [0.5, 1.3, 1.66, Hh], [1.3, hl, 0, Hh]]) wq('curb', WALL, a0, a1, b0, b1);
  for (const [a0, a1, b0, b1] of [[-hw, -0.4, 0, Hh], [-0.4, 0.14, 0, 1.38], [-0.4, 0.14, 1.66, Hh], [0.14, hw, 0, Hh]]) wq('front', WALL, a0, a1, b0, b1);
  for (const [a0, a1, b0, b1] of [[-hw, -0.66, 0, Hh], [0.66, hw, 0, Hh], [-0.66, 0.66, 1.62, Hh]]) wq('rear', WALL, a0, a1, b0, b1);
  for (const x of [-hw + 0.012, hw - 0.012]) bx(ALU, x - 0.012, x + 0.012, Hh - 0.024, Hh, -hl, hl);                      // ceiling trim
  for (const z of [-0.58, 0.58]) bx(SEAM, -hw, hw, Hh - 0.0015, Hh, z - 0.002, z + 0.002);

  // ---- rear wall: two doors with windows, kick plates, conspicuity tape, handles, threshold
  for (const s of [1, -1]) {
    const q = (a, b, y0, y1) => wq('rear', DOOR, Math.min(s * a, s * b), Math.max(s * a, s * b), y0, y1);
    q(0.012, 0.16, 0, 1.62); q(0.5, 0.66, 0, 1.62); q(0.16, 0.5, 0, 0.82); q(0.16, 0.5, 1.36, 1.62);
    on(s * 0.33, 1.09, -hl + 0.001, 0, () => { B.plane(SKWIN, 0.34, 0.54); gasket(0, 0.34, 0.54); });
    bx(DIA, Math.min(s * 0.03, s * 0.64), Math.max(s * 0.03, s * 0.64), 0.03, 0.3, -hl, -hl + 0.004);
    label('tape', 0.58, s * 0.335, 0.37, -hl + 0.003, 0);
    bx(RUB, s * 0.66 - 0.008, s * 0.66 + 0.008, 0, 1.62, -hl, -hl + 0.01);
    B.tube(YEL, [[s * 0.58, 0.9, -hl + 0.01], [s * 0.58, 0.95, -hl + 0.075], [s * 0.58, 1.32, -hl + 0.075], [s * 0.58, 1.37, -hl + 0.01]], 0.014, 8); for (const y of [0.9, 1.37]) B.cyl(STL, 0.026, 0.026, 0.006, s * 0.58, y, -hl + 0.004, 'z', 10);
    if (s > 0) { B.tube(STL, [[0.085, 0.06, -hl + 0.022], [0.085, 1.58, -hl + 0.022]], 0.008, 6); for (const y of [0.2, 0.7, 1.45]) bx(STL, 0.065, 0.105, y - 0.02, y + 0.02, -hl, -hl + 0.034, 0.004); B.at(0.085, 0.98, -hl + 0.03, 0, 0, -0.5, () => { B.rbox(RED, 0.035, 0.16, 0.018, 0.006, 0, -0.06, 0); B.cyl(STL, 0.018, 0.018, 0.03, 0, 0, 0, 'z', 10); }); }
    else on(-0.1, 0.98, -hl + 0.001, 0, latch);
  }
  bx(RUB, -0.014, 0.014, 0, 1.62, -hl, -hl + 0.012); bx(RUB, -0.66, 0.66, 1.612, 1.628, -hl, -hl + 0.01);
  bx(DIA, -0.66, 0.66, 0, 0.012, -hl, -hl + 0.13); label('warn', 0.1, -0.33, 0.62, -hl + 0.003, 0); label('exit', 0.2, 0, 1.69, -hl + 0.003, 0);

  // ---- street side: tall rear cabinet, CPR seat, counter with the kit bay, action wall, overhead cabinets
  const xc = hw - 0.36, ux = hw - 0.34;
  bx(CAB, xc, hw, 0, Hh, -1.78, -1.2);
  for (const [y0, y1, lab] of [[0.1, 0.98, 6], [1.01, 1.71, 13]]) {
    bx(CABD, xc - 0.014, xc, y0, y1, -1.76, -1.22, 0.005); on(xc - 0.014, (y0 + y1) / 2, -1.3, FX_, latch); hinges(xc - 0.012, y0, y1, -1.765);
    label('lab' + lab, 0.2, xc - 0.0145, y1 - 0.06, -1.49, FX_, 0, 0.03);
  }
  bx(CABK, xc + 0.04, hw, 0, 0.09, -1.2, -0.5); bx(CAB, xc, hw, 0.09, 0.4, -1.2, -0.56); bx(CAB, xc, hw, 0, 0.71, -0.56, -0.5);                  // CPR seat base, divider
  B.rbox(CUSH, 0.37, 0.085, 0.6, 0.03, xc + 0.165, 0.443, -0.88); B.rbox(CUSH, 0.075, 0.62, 0.56, 0.03, hw - 0.04, 0.82, -0.88); B.at(xc + 0.165, 0.455, -0.88, () => piping(0.37, 0.6)); B.at(hw - 0.05, 0.82, -0.88, 0, 0, PI / 2, () => piping(0.62, 0.56)); B.rbox(CUSHD, 0.07, 0.2, 0.3, 0.03, hw - 0.038, 1.3, -0.88);
  B.box(WEB, 0.3, 0.003, 0.046, xc + 0.16, 0.487, -0.7); B.rbox(BLK, 0.05, 0.02, 0.06, 0.006, xc + 0.03, 0.495, -0.7); B.rbox(RED, 0.024, 0.006, 0.03, 0.002, xc + 0.03, 0.507, -0.7);
  B.box(WEB, 0.26, 0.003, 0.046, xc + 0.19, 0.487, -1.07); B.rbox(SK.chrome, 0.05, 0.004, 0.03, 0.001, xc + 0.05, 0.489, -1.07);
  label('belt', 0.24, hw - 0.002, 1.55, -0.95, FX_); bx(BLK, hw - 0.03, hw, 1.44, 1.66, -0.75, -0.58, 0.008); label('radio', 0.15, hw - 0.031, 1.55, -0.665, FX_, 0, 0.195);
  // counter forward of the bay: three drawers and a door
  bx(CABK, xc + 0.04, hw, 0, 0.09, 0.32, 1.4); bx(CAB, xc, hw, 0.09, 0.71, 0.32, 1.4);
  for (const [y0, y1] of [[0.11, 0.3], [0.315, 0.5], [0.515, 0.695]]) { bx(CABD, xc - 0.014, xc, y0, y1, 0.335, 0.87, 0.005); on(xc - 0.014, (y0 + y1) / 2 + 0.02, 0.6, FX_, () => pull(0.14)); }
  bx(CABD, xc - 0.014, xc, 0.11, 0.695, 0.885, 1.385, 0.005); on(xc - 0.014, 0.4, 0.95, FX_, latch); hinges(xc - 0.012, 0.11, 0.695, 1.39); label('lab7', 0.2, xc - 0.0145, 0.63, 1.14, FX_, 0, 0.03); label('lab8', 0.2, xc - 0.0145, 0.66, 0.6, FX_, 0, 0.03);
  bx(TOP, xc - 0.02, hw, 0.71, 0.742, -0.56, 1.4, 0.008); bx(ALU, xc - 0.028, xc - 0.02, 0.704, 0.756, -0.56, 1.4, 0.003);
  bx(MATR, xc, hw, 0, 0.006, -0.5, 0.32); bx(CABK, hw - 0.012, hw, 0.006, 0.12, -0.5, 0.32);                                                     // kit bay
  // action wall, front to back: wipes and sanitiser, gloves, sharps, controls and outlets, oxygen, suction
  B.cyl(WHT, 0.046, 0.046, 0.17, hw - 0.075, 0.827, 1.28, 'y', 14); B.cyl(surf(0x5b3f96, 0.4), 0.048, 0.048, 0.026, hw - 0.075, 0.925, 1.28, 'y', 14); B.rbox(surf([0.5, 0.62, 0.7], 0.15), 0.06, 0.13, 0.045, 0.012, hw - 0.07, 0.807, 1.16); B.cyl(WHT, 0.008, 0.008, 0.05, hw - 0.07, 0.895, 1.16, 'y', 8); B.box(WHT, 0.03, 0.01, 0.012, hw - 0.082, 0.92, 1.16);
  bx(STL, hw - 0.118, hw, 0.8, 1.07, 0.732, 0.738); bx(STL, hw - 0.118, hw, 0.8, 1.07, 0.982, 0.988); bx(STL, hw - 0.118, hw, 0.812, 0.818, 0.738, 0.982); bx(STL, hw - 0.122, hw - 0.116, 0.8, 0.84, 0.732, 0.988);
  for (let i = 0; i < 3; i++) { const y = 0.853 + i * 0.07; bx(WHT, hw - 0.112, hw - 0.004, y - 0.032, y + 0.032, 0.742, 0.978); label('glove' + i, 0.23, hw - 0.1125, y, 0.86, FX_, 0, 0.062); }
  bx(STL, hw - 0.012, hw, 0.79, 1.09, 0.5, 0.67); B.rbox(surf([0.5, 0.03, 0.025], 0.3), 0.115, 0.2, 0.135, 0.014, hw - 0.07, 0.905, 0.585); B.rbox(surf([0.75, 0.74, 0.7], 0.3), 0.12, 0.05, 0.14, 0.012, hw - 0.07, 1.03, 0.585); bx(CABK, hw - 0.115, hw - 0.04, 1.045, 1.058, 0.54, 0.63); label('sharps', 0.1, hw - 0.1285, 0.905, 0.585, FX_);
  bx(ALU, hw - 0.012, hw, 0.95, 1.17, 0.03, 0.47, 0.004); label('panel', 0.42, hw - 0.0125, 1.06, 0.25, FX_);
  for (let i = 0; i < 10; i++) { const z = 0.25 + (62 + (i % 5) * 88 - 346) * 0.000607, y = 1.06 + (165 - (108 + (i / 5 | 0) * 140)) * 0.000607; B.at(hw - 0.016, y, z, 0, 0, [0, 3, 7, 8].includes(i) ? 0.2 : -0.2, () => B.rbox(GLOSS, 0.008, 0.03, 0.026, 0.003)); }
  for (const px of [520, 628]) B.cyl(BLK, 0.014, 0.012, 0.016, hw - 0.02, 1.06 + (165 - 262) * 0.000607, 0.25 + (px - 346) * 0.000607, 'x', 12);
  for (const z of [0.14, 0.34]) { bx(WHT, hw - 0.006, hw, 0.8, 0.915, z - 0.0375, z + 0.0375, 0.002); label('outlet', 0.072, hw - 0.0065, 0.8575, z, FX_); }
  B.rbox(PILOT, 0.004, 0.008, 0.008, 0.001, hw - 0.007, 0.925, 0.14);
  label('o2', 0.11, hw - 0.002, 1.215, -0.14, FX_); label('suction', 0.11, hw - 0.002, 1.215, -0.39, FX_);
  for (const z of [-0.08, -0.2]) {
    bx(WHT, hw - 0.005, hw, 1.09, 1.17, z - 0.04, z + 0.04, 0.002); label('o2out', 0.076, hw - 0.0055, 1.13, z, FX_); B.cyl(STL, 0.013, 0.013, 0.034, hw - 0.02, 1.13, z, 'x', 10); B.cyl(GRN, 0.016, 0.016, 0.008, hw - 0.012, 1.13, z, 'x', 12);
    B.rbox(SK.chrome, 0.03, 0.04, 0.032, 0.006, hw - 0.05, 1.125, z); B.cyl(ACR, 0.0115, 0.0115, 0.085, hw - 0.05, 1.187, z, 'y', 10); B.cyl(SK.chrome, 0.013, 0.013, 0.01, hw - 0.05, 1.234, z, 'y', 10); B.ball(SK.steel, 0.005, 0.005, 0.005, hw - 0.05, 1.172 + (z < -0.1 ? 0.03 : 0), z, 6);
    label('flow', 0.012, hw - 0.062, 1.187, z, FX_, 0, 0.075); B.cyl(GRN, 0.015, 0.013, 0.02, hw - 0.075, 1.122, z, 'x', 12); B.cyl(GRN, 0.004, 0.0075, 0.03, hw - 0.05, 1.09, z, 'y', 8);
  }
  { const z = -0.2, g = surf([0.2, 0.55, 0.3], 0.25), pts = [[hw - 0.05, 1.08, z], [hw - 0.05, 0.98, z + 0.005], [hw - 0.06, 0.86, z + 0.03], [hw - 0.1, 0.75, z + 0.06]]; for (let k = 0; k <= 44; k++) { const a = k / 22 * TAU + 0.4; pts.push([hw - 0.17 + Math.cos(a) * (0.07 - k * 0.0004), 0.748 + k * 0.00025, z + 0.08 + Math.sin(a) * (0.07 - k * 0.0004)]); } B.tube(g, pts, 0.0036, 5, { caps: false }); }
  B.cyl(STL, 0.012, 0.012, 0.03, hw - 0.015, 1.13, -0.34, 'x', 8); B.rbox(surf(g3(0.6), 0.4), 0.055, 0.13, 0.085, 0.012, hw - 0.055, 1.115, -0.34); B.cyl(SK.chrome, 0.037, 0.037, 0.012, hw - 0.087, 1.14, -0.34, 'x', 16); label('gauge', 0.066, hw - 0.0935, 1.14, -0.34, FX_); B.cyl(BLK, 0.016, 0.013, 0.02, hw - 0.092, 1.076, -0.34, 'x', 12);
  bx(STL, hw - 0.03, hw, 0.94, 0.975, -0.47, -0.41); B.at(hw - 0.088, 0.957, -0.44, () => B.lathe(STL, [[-0.012, 0.0615], [0.012, 0.0615]], { axis: 'y', seg: 16 }));
  B.cyl(ACR, 0.049, 0.057, 0.17, hw - 0.088, 0.925, -0.44, 'y', 16); B.cyl(surf([0.08, 0.2, 0.5], 0.35), 0.06, 0.06, 0.018, hw - 0.088, 1.018, -0.44, 'y', 16); for (const dz of [-0.022, 0.022]) B.cyl(WHT, 0.007, 0.006, 0.022, hw - 0.088, 1.036, -0.44 + dz, 'y', 6);
  label('canister', 0.034, hw - 0.1455, 0.925, -0.44, FX_, 0, 0.1);
  B.tube(ACR, [[hw - 0.055, 1.05, -0.355], [hw - 0.07, 1.085, -0.39], [hw - 0.088, 1.05, -0.418]], 0.005, 5, { caps: false }); B.tube(ACR, [[hw - 0.088, 1.045, -0.462], [hw - 0.1, 1.09, -0.475], [hw - 0.14, 1.0, -0.48], [hw - 0.15, 0.84, -0.47], [hw - 0.12, 0.78, -0.42], [hw - 0.16, 0.75, -0.36]], 0.005, 5, { caps: false });
  // overhead cabinets with sliding acrylic doors
  bx(CAB, ux, hw, 1.25, 1.275, -0.5, 1.2); for (const z of [-0.488, 0.35, 1.188]) bx(CAB, ux, hw, 1.275, Hh, z - 0.012, z + 0.012); bx(CAB, ux + 0.03, hw, 1.5, 1.512, -0.476, 1.176);
  for (const [lo, hi, la] of [[-0.476, 0.338, 10], [0.362, 1.176, 9]]) { stock(true, lo, hi, 1.275, 0.19, ux + 0.03, 1); stock(true, lo, hi, 1.512, 0.17, ux + 0.03, 1); sliders(true, lo - 0.012, hi + 0.012, 1.25, Hh, ux, 1, la); }
  B.at(ux + 0.15, 1.2455, 0.35, PI / 2, 0, 0, () => { B.plane(STRIP, 0.026, 1.6); }); bx(ALU, ux + 0.13, ux + 0.17, 1.246, 1.2505, -0.46, 1.16);

  // ---- bulkhead: tall cabinet on the street side, attendant seat, pass-through, clock, cabinet over the corner
  bx(CAB, 0.4, 0.422, 0, Hh, 1.4, hl); bx(CAB, 0.422, hw, 0, 0.74, 1.4, hl); bx(CAB, 0.422, hw, 1.19, 1.212, 1.4, hl);
  bx(CABD, 0.44, hw - 0.02, 0.09, 0.7, 1.386, 1.4, 0.005); on(0.52, 0.42, 1.386, PI, latch); hinges(hw - 0.016, 0.09, 0.7, 1.388); label('lab2', 0.2, 0.76, 0.64, 1.3855, PI, 0, 0.03); bx(CABK, 0.44, hw, 0, 0.08, 1.4, 1.44);
  stock(false, 0.43, hw - 0.01, 0.74, 0.26, 1.43, 1); stock(false, 0.43, hw - 0.01, 1.212, 0.3, 1.43, 1); sliders(false, 0.422, hw, 0.74, 1.19, 1.4, 1, 1); sliders(false, 0.422, hw, 1.212, Hh, 1.4, 1, 0);
  on(-0.13, 1.52, hl - 0.001, PI, () => { B.plane(SKWIN, 0.54, 0.28); gasket(0, 0.54, 0.28, 0.03); bx(ALUV, -0.008, 0.008, -0.14, 0.14, 0.002, 0.012); B.rbox(BLK, 0.02, 0.05, 0.02, 0.004, -0.03, 0, 0.014); });
  bx(BLK, 0.17, 0.37, 1.42, 1.62, hl - 0.012, hl, 0.006); label('clock', 0.19, 0.27, 1.52, hl - 0.0125, PI);
  const sa = [-0.1, 0, hl - 0.42];
  B.rbox(BLK, 0.34, 0.24, 0.34, 0.03, sa[0], 0.13, sa[2]); B.cyl(SK.steel, 0.15, 0.15, 0.02, sa[0], 0.262, sa[2], 'y', 20); B.rbox(BLK, 0.44, 0.06, 0.42, 0.02, sa[0], 0.3, sa[2]);
  B.rbox(CUSH, 0.5, 0.11, 0.48, 0.045, sa[0], 0.385, sa[2] - 0.01); B.at(sa[0], 0.4, sa[2] - 0.01, () => piping(0.5, 0.48, 0.045)); for (const s of [1, -1]) B.rbox(CUSHD, 0.07, 0.07, 0.4, 0.03, sa[0] + s * 0.225, 0.43, sa[2] - 0.01);
  B.at(sa[0], 0.8, sa[2] + 0.245, 0.1, 0, 0, () => {
    B.rbox(CUSH, 0.5, 0.7, 0.11, 0.045); for (const s of [1, -1]) B.rbox(CUSHD, 0.075, 0.56, 0.08, 0.03, s * 0.22, -0.03, -0.05); B.rbox(CUSHD, 0.27, 0.19, 0.1, 0.04, 0, 0.45, -0.012); for (const s of [1, -1]) B.cyl(STL, 0.006, 0.006, 0.1, s * 0.07, 0.36, 0, 'y', 6);
    for (const s of [1, -1]) { B.box(WEB, 0.046, 0.62, 0.003, s * 0.11, 0.0, -0.058); B.rbox(BLK, 0.06, 0.04, 0.03, 0.006, s * 0.11, 0.32, -0.062); }
  });
  B.box(WEB, 0.4, 0.003, 0.046, sa[0], 0.443, sa[2] + 0.12); B.rbox(BLK, 0.055, 0.02, 0.065, 0.006, sa[0], 0.452, sa[2] + 0.06); B.rbox(RED, 0.026, 0.006, 0.03, 0.002, sa[0], 0.464, sa[2] + 0.06);
  bx(CAB, -hw, -0.48, 1.15, Hh, 1.44, hl); for (const [x0, x1, lab] of [[-hw + 0.012, -0.796, 3], [-0.784, -0.492, 4]]) { bx(CABD, x0, x1, 1.17, 1.73, 1.426, 1.44, 0.005); on((x0 + x1) / 2, 1.24, 1.426, PI, latch); label('lab' + lab, 0.2, (x0 + x1) / 2, 1.67, 1.4255, PI, 0, 0.03); B.cyl(STL, 0.007, 0.007, 0.075, x0 + 0.004, 1.3, 1.432, 'y', 8); B.cyl(STL, 0.007, 0.007, 0.075, x0 + 0.004, 1.6, 1.432, 'y', 8); }
  label('nosmoke', 0.44, -0.79, 0.99, hl - 0.003, PI); label('idplate', 0.2, -0.79, 0.84, hl - 0.003, PI);
  bx(ALU, -1.0, -0.58, 0.14, 0.44, hl - 0.012, hl, 0.004); bx(PERF, -0.98, -0.6, 0.16, 0.42, hl - 0.016, hl - 0.01);

  // ---- curb side: squad bench with belts, window, overhead locker, side door, extinguisher
  const bz0 = -1.78, bz1 = 0.4, bxf = -0.6;
  bx(CABK, -hw, bxf - 0.04, 0, 0.09, bz0, bz1); bx(CAB, -hw, bxf, 0.09, 0.385, bz0, bz1);
  for (const z of [-1.055, -0.33]) bx(SEAM, bxf - 0.001, bxf + 0.0012, 0.1, 0.38, z - 0.002, z + 0.002);
  bx(CABD, bxf, bxf + 0.012, 0.13, 0.35, 0.06, 0.36, 0.005); on(bxf + 0.012, 0.3, 0.21, FXp, () => pull(0.12)); label('lab11', 0.16, bxf + 0.0125, 0.2, 0.21, FXp, 0, 0.026); label('bio', 0.055, bxf + 0.0125, 0.2, 0.1, FXp);
  for (const zc of [-1.415, -0.69, 0.035]) {
    B.rbox(CUSH, 0.5, 0.09, 0.705, 0.032, -0.85, 0.428, zc); B.rbox(CUSH, 0.075, 0.4, 0.69, 0.032, -hw + 0.04, 0.745, zc); B.at(-0.85, 0.44, zc, () => piping(0.5, 0.705)); B.at(-hw + 0.05, 0.745, zc, 0, 0, PI / 2, () => piping(0.4, 0.69));
    B.at(-0.87, 0.475, zc + 0.2, 0, 0.08, 0, () => B.box(WEB, 0.3, 0.003, 0.046)); B.rbox(BLK, 0.052, 0.02, 0.062, 0.006, -0.71, 0.483, zc + 0.19); B.rbox(RED, 0.024, 0.006, 0.03, 0.002, -0.71, 0.495, zc + 0.19);
    B.at(-0.9, 0.475, zc - 0.2, 0, -0.06, 0, () => B.box(WEB, 0.24, 0.003, 0.046)); B.rbox(SK.chrome, 0.05, 0.004, 0.03, 0.001, -0.76, 0.477, zc - 0.208);
  }
  on(-hw + 0.001, 1.155, -0.45, FXp, () => { B.plane(SKWIN, 1.1, 0.35); gasket(0, 1.1, 0.35, 0.03); bx(ALUV, -0.008, 0.008, -0.175, 0.175, 0.002, 0.012); B.rbox(BLK, 0.02, 0.05, 0.02, 0.004, 0.03, 0, 0.014); });
  const lx = -hw + 0.32;
  bx(CAB, -hw, lx, 1.4, 1.425, bz0, bz1); for (const z of [bz0 + 0.012, -0.69, bz1 - 0.012]) bx(CAB, -hw, lx, 1.425, Hh, z - 0.012, z + 0.012);
  for (const [lo, hi, la] of [[bz0 + 0.024, -0.702, 5], [-0.678, bz1 - 0.024, 12]]) { stock(true, lo, hi, 1.425, 0.24, lx - 0.03, -1); sliders(true, lo - 0.012, hi + 0.012, 1.4, Hh, lx, -1, la); }
  // side door
  for (const [a0, a1, b0, b1] of [[0.5, 0.66, 0, 1.66], [1.14, 1.3, 0, 1.66], [0.66, 1.14, 0, 0.86], [0.66, 1.14, 1.4, 1.66]]) wq('curb', DOOR, a0, a1, b0, b1);
  on(-hw + 0.001, 1.13, 0.9, FXp, () => { B.plane(SKWIN, 0.48, 0.54); gasket(0, 0.48, 0.54); });
  for (const z of [0.5, 1.3]) bx(RUB, -hw, -hw + 0.01, 0, 1.66, z - 0.009, z + 0.009); bx(RUB, -hw, -hw + 0.01, 1.652, 1.668, 0.5, 1.3);
  bx(DIA, -hw, -hw + 0.004, 0.03, 0.27, 0.53, 1.27); label('tape', 0.7, -hw + 0.003, 0.33, 0.9, FXp); label('exit', 0.16, -hw + 0.003, 1.708, 0.9, FXp); on(-hw + 0.001, 0.98, 0.6, FXp, latch);
  B.tube(YEL, [[-hw + 0.01, 0.8, 1.38], [-hw + 0.075, 0.86, 1.38], [-hw + 0.075, 1.4, 1.38], [-hw + 0.01, 1.46, 1.38]], 0.014, 8); for (const y of [0.8, 1.46]) B.cyl(STL, 0.026, 0.026, 0.006, -hw + 0.004, y, 1.38, 'x', 10);
  B.cyl(RED, 0.056, 0.056, 0.33, -hw + 0.09, 0.3, 1.52, 'y', 16); B.ball(RED, 0.056, 0.03, 0.056, -hw + 0.09, 0.465, 1.52, 12); B.cyl(SK.steel, 0.016, 0.02, 0.05, -hw + 0.09, 0.51, 1.52, 'y', 8); B.rbox(BLK, 0.02, 0.022, 0.11, 0.006, -hw + 0.09, 0.55, 1.5); B.cyl(WHT, 0.018, 0.018, 0.006, -hw + 0.11, 0.515, 1.52, 'x', 10);
  B.tube(BLK, [[-hw + 0.09, 0.52, 1.56], [-hw + 0.13, 0.46, 1.59], [-hw + 0.14, 0.3, 1.585]], 0.008, 5); bx(SK.steel, -hw, -hw + 0.15, 0.36, 0.385, 1.46, 1.58); bx(SK.steel, -hw, -hw + 0.02, 0.1, 0.5, 1.5, 1.54); label('ext', 0.078, -hw + 0.148, 0.27, 1.52, FXp);

  // ---- ceiling: light panels, grab rails, IV hooks, vents, speaker
  const domes = [[-0.42, 1.1], [0.42, 1.1], [-0.42, 0], [0.42, 0], [-0.42, -1.1], [0.42, -1.1]];
  for (const [x, z] of domes) { B.rbox(ALU, 0.2, 0.014, 0.58, 0.005, x, Hh - 0.007, z); B.at(x, Hh - 0.0145, z, PI / 2, 0, 0, () => B.plane(DOME, 0.165, 0.545)); }
  for (const x of [-0.14, 0.26]) { B.tube(YEL, [[x, Hh - 0.005, -1.3], [x, Hh - 0.078, -1.235], [x, Hh - 0.078, 0.995], [x, Hh - 0.005, 1.06]], 0.016, 10); for (const z of [-1.3, -0.5, 0.3, 1.06]) { B.cyl(STL, 0.03, 0.03, 0.006, x, Hh - 0.003, z, 'y', 12); if (Math.abs(z + 0.1) < 0.5) B.cyl(STL, 0.009, 0.009, 0.07, x, Hh - 0.04, z, 'y', 8); } }
  for (const z of [0.5, -0.2]) { bx(STL, 0.07, 0.13, Hh - 0.005, Hh, z - 0.02, z + 0.02); B.tube(STL, [[0.1, Hh, z], [0.1, Hh - 0.05, z], [0.13, Hh - 0.072, z], [0.155, Hh - 0.05, z]], 0.005, 6); }
  for (const [x, z] of [[-0.75, 1.5], [0.0, 1.55]]) { B.rbox(ALU, 0.32, 0.012, 0.2, 0.004, x, Hh - 0.006, z); for (let i = 0; i < 5; i++) B.at(x, Hh - 0.016, z - 0.07 + i * 0.035, 0.6, 0, 0, () => B.box(CABK, 0.28, 0.003, 0.03)); }
  B.rbox(ALU, 0.3, 0.012, 0.3, 0.004, -0.75, Hh - 0.006, -1.45); bx(PERF, -0.88, -0.62, Hh - 0.015, Hh - 0.011, -1.58, -1.32); B.cyl(PERF, 0.075, 0.075, 0.008, 0.75, Hh - 0.004, -0.9, 'y', 18);

  // ---- floor hardware: cot antler at the head end, rail clamp by the foot
  bx(surf(g3(0.22), 0.4, 0.5), -0.07, 0.17, 0, 0.012, 0.76, 0.9, 0.004); for (const s of [1, -1]) { B.tube(STL, [[0.05 + s * 0.035, 0.012, 0.84], [0.05 + s * 0.06, 0.13, 0.83], [0.05 + s * 0.15, 0.22, 0.81], [0.05 + s * 0.2, 0.3, 0.78]], 0.013, 8); B.ball(SK.rubber, 0.018, 0.018, 0.018, 0.05 + s * 0.2, 0.3, 0.78, 8); for (const z of [0.78, 0.88]) B.cyl(STL, 0.01, 0.01, 0.005, 0.05 + s * 0.09, 0.014, z, 'y', 6); }
  B.rbox(STL, 0.05, 0.1, 0.03, 0.006, 0.05, 0.06, 0.85);
  bx(withFx(SK.alu, FX.ribbed, 1), 0.385, 0.455, 0, 0.012, -1.4, -0.3, 0.003); bx(STL, 0.4, 0.44, 0.012, 0.25, -0.94, -0.88, 0.004); bx(STL, 0.325, 0.44, 0.236, 0.256, -0.97, -0.85, 0.004); B.rbox(RED, 0.02, 0.06, 0.02, 0.005, 0.45, 0.2, -0.91);

  const acr = new THREE.MeshStandardMaterial({ color: 0xcfe2e8, roughness: 0.06, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2.5 });
  const mats = { dry: makeSurfMat({ lamps, wet: false, map: shared('shade' + seed, () => drawShade(seed)) }), texsheet: new THREE.MeshStandardMaterial({ map: sh.sheet, roughness: 0.42, emissiveMap: sh.emis, emissive: 0xffffff, emissiveIntensity: 1 }), texfloor: makeFloorMat(shared('floor' + seed + cot, () => drawFloor(seed, cot))), texwin: makeWindowMat(), acrylic: acr };
  const g = groupOf(B, mats), group = new THREE.Group(); group.name = 'patientCompartment'; group.add(g['']);
  g[''].traverse(m => { if (m.isMesh) { m.castShadow = false; if (m.material === acr) m.renderOrder = 4; } });
  const mark = (n, x, y, z, tx, ty, tz) => { const o = new THREE.Object3D(); o.name = n; o.applyMatrix4(faceMatrix(x, y, z, tx, ty, tz)); o.userData.target = new THREE.Vector3(tx, ty, tz); group.add(o); return o; };
  const patientSpot = mark('patientSpot', 0.05, 0, -0.25, 0.05, 0, 1), seatAttendant = mark('seatAttendant', sa[0], 1.12, sa[2] - 0.05, 0.05, 0.8, -0.3), cameraHome = mark('cameraHome', -0.55, 1.28, -1.25, 0.15, 0.75, 0.25);
  const lights = domes.filter((d, i) => i % 2 === 0).map(([x, z]) => { const l = new THREE.PointLight(0xeef4ff, 1.6, 6, 1.6); l.position.set(0, Hh - 0.14, z); group.add(l); return l; });
  const fill = new THREE.HemisphereLight(0xe9f0f7, 0xa9adb3, 1.7); group.add(fill); lights.push(fill);
  let stretcher = null;
  if (cot) { stretcher = buildStretcher({ height: 0.55, backrest: 0.35, dry: true }); stretcher.group.position.copy(patientSpot.position); group.add(stretcher.group); }
  const api = {
    group, bounds: new THREE.Box3(new THREE.Vector3(-hw, 0, -hl), new THREE.Vector3(hw, Hh, hl)), patientSpot, seatAttendant, cameraHome, lights, stretcher, materials: mats,
    setLights(on) { for (const l of lights) l.visible = !!on; const v = on ? 2.6 : 0; lamps[3] = 0.92 * v; lamps[4] = 0.97 * v; lamps[5] = v; lamps[6] = 0.4; lamps[7] = 2.2; lamps[8] = 0.8; },
    tris: B.tris(),
  };
  api.setLights(opts.lights !== false);
  return api;
}

// ---------------------------------------------------------------------------------------------- dev harness

// dev.html?m=vehicles-interior: the room as the game shows it (own scene, black outside, its own reflection probe).
// &lights=0, &back=0..1 (cot backrest), &dummy=1 (a stand-in on the cot). window.__int = { it, stats, relight() }.
export async function devDemo(ctx) {
  const { G, camera, controls, params } = ctx, it = buildAmbulanceInterior({ lights: params.get('lights') !== '0' });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x040506); scene.add(it.group); it.stretcher?.setBackrest?.(+(params.get('back') || 0)); scene.updateMatrixWorld(true);
  if (params.get('dummy')) { const m = new THREE.MeshStandardMaterial({ color: 0xe4e4e0, roughness: 0.8 }), p = it.stretcher.mattressTop.getWorldPosition(new THREE.Vector3()); const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.3, 6, 16), m); b.rotation.x = Math.PI / 2; b.position.set(p.x, p.y + 0.16, p.z + 0.05); scene.add(b); }
  let rt = null; const relight = () => { rt?.dispose(); rt = G.pmrem.fromScene(scene, 0.04); scene.environment = rt.texture; scene.environmentIntensity = 0.3; G.renderer.toneMappingExposure = 0.72; if (G.passes.bloom) G.passes.bloom.strength = 0.1; };
  relight(); G.view(scene, camera);
  const stats = () => { let calls = 0, tris = 0; it.group.traverse(m => { if (m.isMesh && m.visible) { calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } }); return { calls, tris: Math.round(tris), own: it.tris }; };
  window.__int = { it, stats, relight, lights(on) { it.setLights(on); relight(); } };
  const p = it.cameraHome.position, q = it.cameraHome.userData.target; camera.position.set(p.x, p.y, p.z); controls.target.set(q.x, q.y, q.z); camera.fov = 60; camera.near = 0.03; camera.updateProjectionMatrix(); controls.update();
  return null;
}
