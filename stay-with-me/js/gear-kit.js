// What the crew carries in and puts down beside the patient: the monitor / defibrillator, the open response bag with
// its colour-coded pouches, the oxygen barrel bag with cylinder and regulator, and a sharps shuttle. Each builder
// returns a Group whose origin is on the floor under the item; the monitor also returns where its cables plug in.
//
// Where things are tuned: MON (panel layout in millimetres, shared by the printed fascia and the raised keys),
// buildBag() for the bag's proportions and pouch colours, buildOxygen() for the cylinder and regulator.

import * as THREE from 'three';
import { Builder, TR, V3, X, Y, Z, rbox, box, cyl, sph, cap, torus, plate, disc, lathe, tube, slab, roundRect, ribbon, sheet, atlas, mats, lit, C, txt, rr, circ, subRect, grime, HAND } from './gear-lib.js';
import { makeCanvas, canvasTex } from './util.js';

const H = Math.PI / 2;

// ---------------------------------------------------------------- monitor / defibrillator

// Panel layout, millimetres from the top-left of the 360 x 250 fascia.
const MON = {
  W: 360, Hh: 250, screen: [16, 15, 226, 152], bezel: [10, 10, 232, 160],
  soft: [0, 1, 2, 3, 4].map(i => [16 + i * 43, 171, 16 + i * 43 + 38, 183]),
  fn: ['NIBP', '12-LEAD', 'CO₂', 'ALARMS', 'EVENT', 'PRINT'].map((t, i) => [16 + i * 35.6, 191, 16 + i * 35.6 + 32, 207, t]),
  on: [262, 28, 11], analyze: [284, 17, 346, 39], eDn: [258, 58, 298, 76], eUp: [304, 58, 344, 76], charge: [258, 90, 344, 114], shock: [301, 150, 21],
  small: ['SYNC', 'PACER', 'LEAD', 'SIZE'].map((t, i) => [240 + i * 27.4, 186, 240 + i * 27.4 + 24, 204, t]),
  dial: [326, 229, 14], ther: [268, 229, 12.5], printer: [16, 215, 150, 243],
};
const S = 2.3;      // atlas pixels per millimetre for the monitor's print

function drawMonFront(g) {
  g.scale(S, S); const W = MON.W, Hh = MON.Hh;
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#1b1d21'); gr.addColorStop(1, '#131517'); g.fillStyle = gr; g.fillRect(-2, -2, W + 4, Hh + 4);
  rr(g, ...rect4(MON.bezel), 4, '#040506', '#2a2d31', 0.5);
  txt(g, 'HALDANE', 16, 165.2, 6.2, { al: 'left', c: '#dfe3e6', sp: 1.6 }); txt(g, 'R12', 62, 165.2, 6.2, { al: 'left', c: '#e8792a', w: 800 });
  txt(g, 'MONITOR  ·  DEFIBRILLATOR  ·  PACER', 226, 165.4, 2.9, { al: 'right', c: '#8d949b', w: 600, sp: 0.5 });
  for (const k of MON.soft) { rr(g, ...rect4(k), 1.5, '#30343a', '#50555c', 0.4); g.fillStyle = '#9aa1a8'; g.beginPath(); g.moveTo((k[0] + k[2]) / 2 - 2, k[3] - 3.5); g.lineTo((k[0] + k[2]) / 2 + 2, k[3] - 3.5); g.lineTo((k[0] + k[2]) / 2, k[1] + 3); g.fill(); }
  for (const k of MON.fn) { rr(g, ...rect4(k), 1.5, '#30343a', '#50555c', 0.4); txt(g, k[4], (k[0] + k[2]) / 2, (k[1] + k[3]) / 2 + 0.3, k[4].length > 6 ? 3.6 : 4.1, { c: '#eef1f3' }); }
  // the numbered therapy sequence down the right
  const num = (n, y) => { circ(g, 246, y, 4.4, '#e9ecee'); txt(g, n, 246, y + 0.4, 6, { c: '#15171a', w: 800 }); };
  num('1', 28); circ(g, MON.on[0], MON.on[1], MON.on[2] + 1.5, null, '#3d8f58', 0.8); circ(g, ...MON.on, '#1f7a43', '#0e3d21', 0.6);
  g.strokeStyle = '#eafff0'; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.arc(MON.on[0], MON.on[1] + 0.5, 4.6, -1.05, Math.PI + 1.05); g.stroke(); g.beginPath(); g.moveTo(MON.on[0], MON.on[1] - 6); g.lineTo(MON.on[0], MON.on[1] - 0.5); g.stroke();
  txt(g, 'ON', MON.on[0], 43.5, 3, { c: '#aeb5bb' });
  rr(g, ...rect4(MON.analyze), 2, '#d7d9d4', '#8b8f8b', 0.4); txt(g, 'ANALYZE', 315, 28.4, 5, { c: '#1b1d20', w: 800 }); txt(g, 'AED', 315, 43.5, 3, { c: '#aeb5bb' });
  num('2', 67); txt(g, 'ENERGY SELECT', 301, 52.6, 3.3, { c: '#cfd4d8', sp: 0.3 });
  for (const [k, up] of [[MON.eDn, 0], [MON.eUp, 1]]) { rr(g, ...rect4(k), 2, '#30343a', '#5a6068', 0.4); const cx = (k[0] + k[2]) / 2, cy = (k[1] + k[3]) / 2; g.fillStyle = '#f2f4f5'; g.beginPath(); g.moveTo(cx - 5, cy + (up ? 3 : -3)); g.lineTo(cx + 5, cy + (up ? 3 : -3)); g.lineTo(cx, cy + (up ? -4 : 4)); g.fill(); }
  num('3', 102); rr(g, ...rect4(MON.charge), 2.5, '#e5b61c', '#8a6c0c', 0.5); txt(g, 'CHARGE', 301, 102.5, 7, { c: '#1a1608', w: 800, sp: 0.6 });
  num('4', 150); circ(g, MON.shock[0], MON.shock[1], MON.shock[2] + 3, '#0b0c0d', '#5d6166', 0.5); circ(g, ...MON.shock, '#cf3a1c', '#6d1608', 0.8); circ(g, MON.shock[0], MON.shock[1], MON.shock[2] - 3.5, null, 'rgba(255,220,190,0.35)', 0.6);
  g.fillStyle = '#fff6df'; g.beginPath(); for (const [x, y] of [[4, -13], [-7, 2], [-0.5, 2], [-4, 13], [7, -3], [0.5, -3]]) g.lineTo(MON.shock[0] + x, MON.shock[1] + y); g.closePath(); g.fill();
  txt(g, 'SHOCK', MON.shock[0], 179.3, 3.6, { c: '#f0b9a8', sp: 0.8 });
  for (const k of MON.small) { rr(g, ...rect4(k), 1.5, '#30343a', '#50555c', 0.4); txt(g, k[4], (k[0] + k[2]) / 2, (k[1] + k[3]) / 2 + 2.5, 3.3, { c: '#eef1f3' }); circ(g, (k[0] + k[2]) / 2, k[1] + 4, 1.1, k[4] === 'SYNC' || k[4] === 'PACER' ? '#3a2f12' : '#24272b'); }
  // jog dial ring, therapy socket, printer, speaker, batteries
  circ(g, MON.dial[0], MON.dial[1], MON.dial[2] + 3.5, '#0d0e10', '#4a4f55', 0.4); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.strokeStyle = '#7b8189'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(MON.dial[0] + Math.cos(a) * 15.2, MON.dial[1] + Math.sin(a) * 15.2); g.lineTo(MON.dial[0] + Math.cos(a) * 17, MON.dial[1] + Math.sin(a) * 17); g.stroke(); }
  txt(g, 'SELECT', MON.dial[0], 211.5, 2.8, { c: '#aeb5bb', sp: 0.4 });
  circ(g, MON.ther[0], MON.ther[1], MON.ther[2] + 2.5, '#08090a', '#666b72', 0.6); txt(g, 'THERAPY', MON.ther[0], 211.5, 2.8, { c: '#aeb5bb', sp: 0.4 });
  g.fillStyle = '#e8792a'; g.beginPath(); g.moveTo(246, 224); g.lineTo(250, 231); g.lineTo(242, 231); g.fill(); txt(g, '!', 246, 229, 4.4, { c: '#15171a', w: 800 });
  rr(g, ...rect4(MON.printer), 2, '#191b1e', '#3f444a', 0.5); g.fillStyle = '#000'; g.fillRect(27, 220.5, 112, 2.6); txt(g, 'PRINTER', 22, 238.5, 2.7, { al: 'left', c: '#8d949b', sp: 0.4 }); txt(g, '50 mm  25 mm/s', 144, 238.5, 2.5, { al: 'right', c: '#6d737a', w: 600 });
  for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) circ(g, 160 + i * 4.2 + (j & 1) * 2.1, 219 + j * 4, 1.05, '#050607');
  for (let b = 0; b < 2; b++) { txt(g, 'BATT ' + (b + 1), 203, 221 + b * 9, 2.6, { al: 'left', c: '#aeb5bb' }); for (let i = 0; i < 4; i++) { g.fillStyle = i < 3 - b ? '#3ee06f' : '#263029'; g.fillRect(203 + i * 6, 224 + b * 9, 5, 2.4); } }
  txt(g, 'AC', 203, 240.6, 2.6, { al: 'left', c: '#aeb5bb' }); circ(g, 212, 240.4, 1.2, '#2a2f2b');
  g.setTransform(1, 0, 0, 1, g.getTransform().e, g.getTransform().f); grime(g, W * S, Hh * S, 12, 0.7);
}
const rect4 = k => [k[0], k[1], k[2] - k[0], k[3] - k[1]];

// left-hand side: patient connections. 150 x 200 mm; x runs from the back of the unit to the front.
const PORTS = { ecg: [42, 42], spo2: [108, 42], nibp: [42, 106], co2: [108, 106] };
function drawMonSide(g) {
  g.scale(S, S); g.fillStyle = '#26292e'; g.fillRect(-2, -2, 154, 204); rr(g, 4, 4, 142, 192, 5, '#1c1e22', '#3d4147', 0.6);
  const lab = (t, x, y, c) => { g.fillStyle = c; g.fillRect(x - 15, y + 19.5, 30, 1.2); txt(g, t, x, y + 25.5, 5, { c: '#e9ecee' }); };
  circ(g, ...PORTS.ecg, 15, '#0a0b0c', '#2e8a4a', 2); lab('ECG', PORTS.ecg[0], PORTS.ecg[1], '#2e8a4a');
  rr(g, PORTS.spo2[0] - 16, PORTS.spo2[1] - 11, 32, 22, 3, '#0a0b0c', '#2a62b8', 2); lab('SpO₂', PORTS.spo2[0], PORTS.spo2[1], '#2a62b8');
  circ(g, ...PORTS.nibp, 10, '#0a0b0c', '#9aa0a6', 2); lab('NIBP', PORTS.nibp[0], PORTS.nibp[1], '#9aa0a6');
  rr(g, PORTS.co2[0] - 13, PORTS.co2[1] - 10, 26, 20, 3, '#0a0b0c', '#e3b81f', 2); lab('CO₂', PORTS.co2[0], PORTS.co2[1], '#e3b81f');
  // defib-proof symbols, data port caps, serial plate
  for (const [x, y] of [[20, 20], [86, 20]]) { g.strokeStyle = '#cfd4d8'; g.lineWidth = 0.5; g.strokeRect(x - 4, y - 4, 8, 8); txt(g, '♥', x, y + 0.4, 5.5, { c: '#cfd4d8' }); }
  rr(g, 14, 146, 54, 16, 3, '#101113', '#3d4147', 0.5); txt(g, 'USB  ·  DATA', 41, 154.4, 3.4, { c: '#7d848b' });
  rr(g, 82, 146, 54, 16, 3, '#101113', '#3d4147', 0.5); txt(g, 'AUX PWR 12 V', 109, 154.4, 3.4, { c: '#7d848b' });
  rr(g, 14, 168, 122, 22, 1.5, '#d5d7d2'); txt(g, 'HALDANE R12', 18, 173.5, 3.6, { al: 'left', c: '#15171a', w: 800 }); txt(g, 'REF 99577-000041   SN R12-0417-22', 18, 178.8, 2.7, { al: 'left', c: '#15171a', w: 600 }); txt(g, 'IP55   12 V ⎓ 11 A   Li-ion 5.7 Ah x2', 18, 183.4, 2.5, { al: 'left', c: '#15171a', w: 600 });
  for (let i = 0; i < 26; i++) { g.fillStyle = '#15171a'; g.fillRect(96 + i * 1.5, 171, (i * 7 % 3 ? 0.9 : 0.45), 9); }
  g.setTransform(1, 0, 0, 1, g.getTransform().e, g.getTransform().f); grime(g, 150 * S, 200 * S, 31, 0.8);
}
function drawTag(g, w, h) {
  rr(g, 0, 0, w, h, 6, '#e9e6d8'); g.fillStyle = '#1d2c44'; g.fillRect(0, 0, w, h * 0.34); txt(g, 'KETTER COUNTY EMS', w / 2, h * 0.18, h * 0.19, { c: '#fff', sp: 1 });
  txt(g, 'ASSET 00417', 8, h * 0.52, h * 0.17, { al: 'left', c: '#222' }); txt(g, 'NEXT PM 03/27', 8, h * 0.74, h * 0.15, { al: 'left', c: '#222', w: 600 });
  txt(g, 'M14', w - 10, h * 0.66, h * 0.44, { al: 'right', c: '#17181d', f: HAND, rot: -0.06 }); grime(g, w, h, 5, 1.5);
}
function drawPadPouch(g, w, h) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d9dcdf'); gr.addColorStop(0.5, '#f1f2f3'); gr.addColorStop(1, '#c9ccd0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c22a1c'; g.fillRect(0, 0, w, h * 0.2); txt(g, 'DEFIBRILLATION ELECTRODES', w / 2, h * 0.105, h * 0.085, { c: '#fff', sp: 0.6 });
  txt(g, 'ADULT', 14, h * 0.34, h * 0.12, { al: 'left', c: '#1b1d20', w: 800 }); txt(g, '> 8 years / > 25 kg', 14, h * 0.46, h * 0.062, { al: 'left', c: '#1b1d20', w: 600 });
  txt(g, 'Radiotransparent · pre-gelled · 1 pair', 14, h * 0.57, h * 0.055, { al: 'left', c: '#3a3d41', w: 600 });
  // little torso with the two pad sites
  const cx = w * 0.8, cy = h * 0.55; g.strokeStyle = '#1b1d20'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy - h * 0.22, h * 0.055, h * 0.065, 0, 0, 7); g.stroke(); rr(g, cx - h * 0.15, cy - h * 0.14, h * 0.3, h * 0.36, 14, null, '#1b1d20', 2);
  g.fillStyle = '#c22a1c'; g.fillRect(cx - h * 0.12, cy - h * 0.11, h * 0.09, h * 0.11); g.fillRect(cx + h * 0.05, cy + h * 0.03, h * 0.09, h * 0.11);
  txt(g, 'LOT 24F0917   EXP 2027-08', 14, h * 0.86, h * 0.058, { al: 'left', c: '#1b1d20', w: 600 }); for (let i = 0; i < 30; i++) { g.fillStyle = '#1b1d20'; g.fillRect(14 + i * 3.2, h * 0.66, i * 5 % 3 ? 2 : 1, h * 0.12); }
  grime(g, w, h, 8, 0.6);
}
function drawPaper(g, w, h) {
  g.fillStyle = '#f6e3e0'; g.fillRect(0, 0, w, h); g.lineWidth = 0.5; for (let x = 0; x < w; x += 4) { g.strokeStyle = x % 20 ? 'rgba(214,120,120,0.35)' : 'rgba(200,90,90,0.7)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 4) { g.strokeStyle = y % 20 ? 'rgba(214,120,120,0.35)' : 'rgba(200,90,90,0.7)'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = '#141414'; g.lineWidth = 1.2; g.beginPath(); let y0 = h * 0.55; g.moveTo(0, y0);
  for (let x = 0; x < w; x++) { const p = (x % 62) / 62; let v = 0; if (p > 0.1 && p < 0.2) v = -Math.sin((p - 0.1) / 0.1 * Math.PI) * 4; else if (p > 0.26 && p < 0.29) v = 4; else if (p >= 0.29 && p < 0.33) v = -30 * Math.sin((p - 0.29) / 0.04 * Math.PI); else if (p >= 0.33 && p < 0.36) v = 8; else if (p > 0.48 && p < 0.68) v = -Math.sin((p - 0.48) / 0.2 * Math.PI) * 8; g.lineTo(x, y0 + v); } g.stroke();
  txt(g, 'II  x1.0  25 mm/s', 4, 8, 7, { al: 'left', c: '#333', w: 600 });
}
function standbyCanvas() {
  const c = makeCanvas(520, 340), g = c.getContext('2d'); g.fillStyle = '#020304'; g.fillRect(0, 0, 520, 340);
  txt(g, 'HALDANE', 236, 150, 44, { c: '#39424a', sp: 8 }); txt(g, 'R12', 380, 150, 44, { c: '#6a3c1a', w: 800 }); txt(g, 'STANDBY', 260, 200, 15, { c: '#2c343b', sp: 6 });
  g.fillStyle = '#10161b'; g.fillRect(0, 0, 520, 22); txt(g, 'NO PATIENT CONNECTED', 10, 12, 11, { al: 'left', c: '#3d4a55' }); txt(g, 'BATT 1 ▮▮▮  BATT 2 ▮▮▮▮', 510, 12, 11, { al: 'right', c: '#2f5a3d' });
  return c;
}

export function buildMonitor() {
  const B = new Builder(), A = atlas(), R = A.add('monFront', MON.W * S, MON.Hh * S, drawMonFront), RS = A.add('monSide', 150 * S, 200 * S, drawMonSide);
  const yc = 0.158, zf = 0.1, PX = x => -0.18 + x / 1000, PY = y => yc + 0.125 - y / 1000, sr = k => subRect(R, k[0] / MON.W, k[1] / MON.Hh, k[2] / MON.W, k[3] / MON.Hh);
  const body = 0x3b3f45, rub = 0x1a1b1d;
  B.add(rbox(0.386, 0.29, 0.186, 0.026, 4), 'hard', { m: TR(0, 0.153, 0), c: body, r: 0.62 });
  B.add(rbox(0.368, 0.258, 0.014, 0.011, 3), 'hard', { m: TR(0, yc, zf - 0.008), c: 0x15171a, r: 0.42 });
  B.add(plate(0.36, 0.25), 'label', { m: TR(0, yc, zf - 0.0007), uv: { rect: R }, r: 0.4 });
  // raised keys, each topped with its own piece of the print
  const key = (k, h = 0.0022, c = 0x2b2e33) => { const w = (k[2] - k[0]) / 1000, hh = (k[3] - k[1]) / 1000, cx = PX((k[0] + k[2]) / 2), cy = PY((k[1] + k[3]) / 2);
    B.add(rbox(w, hh, h + 0.002, 0.0012, 2), 'hard', { m: TR(cx, cy, zf + h / 2 - 0.001), c, r: 0.8 }); B.add(plate(w - 0.0016, hh - 0.0016), 'label', { m: TR(cx, cy, zf + h + 0.00015), uv: { rect: sr(k) }, r: 0.62 }); };
  for (const k of [...MON.soft, ...MON.fn, ...MON.small, MON.eDn, MON.eUp]) key(k);
  key(MON.analyze, 0.003, 0xd7d9d4); key(MON.charge, 0.0035, 0xd9ad1a);
  const round = (c3, h, col, top = true) => { const r = c3[2] / 1000, cx = PX(c3[0]), cy = PY(c3[1]); B.add(cyl(r, r * 1.04, h, 28), 'hard', { m: TR(cx, cy, zf + h / 2 - 0.0005, H, 0, 0), c: col, r: 0.6 }); if (top) B.add(disc(r * 0.97, 28), 'label', { m: TR(cx, cy, zf + h - 0.0003), uv: { rect: sr([c3[0] - c3[2], c3[1] - c3[2], c3[0] + c3[2], c3[1] + c3[2]]) }, r: 0.45 }); return [cx, cy]; };
  round(MON.on, 0.003, 0x1f7a43);
  const [sx, sy] = round(MON.shock, 0.0055, 0x8f2212, false);
  // jog dial: knurled barrel with a domed cap
  { const cx = PX(MON.dial[0]), cy = PY(MON.dial[1]), r = MON.dial[2] / 1000; B.add(cyl(r, r * 1.05, 0.013, 28), 'hard', { m: TR(cx, cy, zf + 0.006, H, 0, 0), c: 0x4a4f56, r: 0.55, mt: 0.25 });
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; B.add(box(0.0012, 0.0012, 0.011), 'hard', { m: TR(cx + Math.cos(a) * r * 1.03, cy + Math.sin(a) * r * 1.03, zf + 0.0065, 0, 0, a), c: 0x33373c, r: 0.7 }); }
    B.add(cyl(r * 0.72, r * 0.8, 0.003, 24), 'hard', { m: TR(cx, cy, zf + 0.0135, H, 0, 0), c: 0x23262a, r: 0.4 }); }
  // therapy socket with the cable's grey connector plugged in
  const tx = PX(MON.ther[0]), ty = PY(MON.ther[1]);
  B.add(cyl(0.0125, 0.0135, 0.006, 24), 'hard', { m: TR(tx, ty, zf + 0.002, H, 0, 0), c: 0x101113, r: 0.5 });
  B.add(cyl(0.0105, 0.0115, 0.024, 20), 'hard', { m: TR(tx, ty, zf + 0.015, H, 0, 0), c: 0x8d9298, r: 0.55 }); B.add(cyl(0.006, 0.0095, 0.018, 16), 'hard', { m: TR(tx, ty, zf + 0.035, H, 0, 0), c: 0x6c7177, r: 0.7 });
  B.add(torus(0.011, 0.0012, 20, 6), 'hard', { m: TR(tx, ty, zf + 0.012), c: 0xe8792a, r: 0.5 });
  // printer paper tongue
  { const x0 = PX(34), x1 = PX(128), y0 = PY(221.8), grid = [], rows = 6; for (let r = 0; r < rows; r++) { const t = r / (rows - 1); for (const x of [x0, x1]) grid.push(V3(x, y0 - 0.026 * t * t, zf - 0.002 + 0.03 * Math.sin(t * 1.25))); }
    B.add(sheet(grid, rows, 2), 'label', { uv: { rect: A.add('paper', 240, 110, drawPaper) }, r: 0.75 }); }
  // bumpers, feet, accent bands
  for (const sxn of [-1, 1]) for (const szn of [-1, 1]) { B.add(rbox(0.052, 0.306, 0.052, 0.02, 3), 'hard', { m: TR(sxn * 0.178, 0.156, szn * 0.078), c: rub, r: 0.92 });
    for (const y of [0.046, 0.266]) B.add(rbox(0.0545, 0.01, 0.0545, 0.004, 2), 'hard', { m: TR(sxn * 0.178, y, szn * 0.078), c: C.orange, r: 0.6 });
    B.add(cyl(0.014, 0.016, 0.008, 12), 'hard', { m: TR(sxn * 0.165, 0.004, szn * 0.07), c: rub, r: 0.95 }); }
  // carry handle with a ribbed rubber grip
  B.add(tube([V3(-0.135, 0.285, 0), V3(-0.135, 0.325, 0), V3(-0.108, 0.352, 0), V3(0, 0.354, 0), V3(0.108, 0.352, 0), V3(0.135, 0.325, 0), V3(0.135, 0.285, 0)], 0.0115, 10, 40), 'hard', { c: 0x2b2e33, r: 0.55, uv: [2, 1] });
  for (let i = 0; i < 11; i++) B.add(cyl(0.0152, 0.0152, 0.0085, 14), 'hard', { m: TR(-0.065 + i * 0.013, 0.354, 0, 0, 0, H), c: rub, r: 0.95 });
  for (const s of [-1, 1]) { B.add(cyl(0.0162, 0.0162, 0.006, 14), 'hard', { m: TR(s * 0.079, 0.3535, 0, 0, 0, H), c: C.orange, r: 0.55 }); B.add(rbox(0.04, 0.012, 0.05, 0.005), 'hard', { m: TR(s * 0.135, 0.298, 0), c: 0x2b2e33, r: 0.6 }); }
  // patient connections on the left side
  B.add(plate(0.15, 0.2), 'label', { m: TR(-0.1935, 0.17, 0, 0, -H, 0), uv: { rect: RS }, r: 0.5 });
  const PP = k => V3(-0.1935, 0.27 - PORTS[k][1] / 1000, -0.075 + PORTS[k][0] / 1000);
  for (const [k, col, r] of [['ecg', C.green, 0.0135], ['nibp', 0x9aa0a6, 0.0085]]) { const p = PP(k); B.add(cyl(r, r, 0.006, 20), 'hard', { m: TR(p.x - 0.002, p.y, p.z, 0, 0, H), c: 0x0c0d0e, r: 0.5 }); B.add(torus(r, 0.0016, 20, 6), 'hard', { m: TR(p.x - 0.005, p.y, p.z, 0, H, 0), c: col, r: 0.45, mt: k === 'nibp' ? 0.9 : 0 }); }
  for (const [k, col, w, h] of [['spo2', C.blue, 0.03, 0.02], ['co2', 0xe3b81f, 0.024, 0.018]]) { const p = PP(k); B.add(rbox(0.006, h, w, 0.003), 'hard', { m: TR(p.x - 0.002, p.y, p.z), c: 0x0c0d0e, r: 0.5 }); B.add(rbox(0.004, h + 0.004, w + 0.004, 0.004), 'hard', { m: TR(p.x - 0.0005, p.y, p.z), c: col, r: 0.5 }); B.add(rbox(0.0045, h - 0.002, w - 0.002, 0.002), 'hard', { m: TR(p.x - 0.0012, p.y, p.z), c: 0x08090a, r: 0.4 }); }
  // side pouch (right) with a coil of spare cable strapped to it; back pouch with a sealed pair of pads
  B.add(rbox(0.05, 0.2, 0.135, 0.016, 3), 'fabric', { m: TR(0.214, 0.125, -0.002), c: 0x1d1e21, r: 0.92 }); B.add(rbox(0.054, 0.06, 0.139, 0.014, 3), 'fabric', { m: TR(0.215, 0.205, -0.002), c: 0x222327, r: 0.92 });
  B.add(ribbon([V3(0.2425, 0.176, -0.064), V3(0.2425, 0.176, 0.064)], X, 0.007, 0.002), 'web', { c: 0x0c0c0d, r: 0.7 }); B.add(rbox(0.004, 0.02, 0.007, 0.0015), 'hard', { m: TR(0.245, 0.166, 0.045), c: C.orange, r: 0.6 });
  for (let i = 0; i < 4; i++) B.add(torus(0.036 + (i % 2) * 0.004, 0.0032, 24, 6), 'hard', { m: TR(0.243 + i * 0.0045, 0.105 + (i % 2) * 0.004, -0.002, 0, H, 0.1 * i), c: 0x70757b, r: 0.6 });
  B.add(ribbon([V3(0.239, 0.15, -0.002), V3(0.262, 0.146, -0.002), V3(0.264, 0.062, -0.002), V3(0.239, 0.058, -0.002)], [Y, V3(1, 0.3, 0).normalize(), V3(1, -0.3, 0).normalize(), V3(0, -1, 0)], 0.024, 0.0015), 'fuzz', { c: 0x111214, r: 0.95, s: 2 });
  B.add(rbox(0.32, 0.19, 0.04, 0.014, 3), 'fabric', { m: TR(0, 0.125, -0.112), c: 0x1d1e21, r: 0.92 });
  B.add(rbox(0.2, 0.125, 0.006, 0.002), 'hard', { m: TR(-0.03, 0.222, -0.118, 0.06, 0, 0.03), c: 0xd6d9dc, r: 0.3, mt: 0.6 });
  B.add(plate(0.196, 0.121), 'label', { m: TR(-0.03, 0.222, -0.1215, 0.06, Math.PI, -0.03), uv: { rect: A.add('padPouch', 420, 260, drawPadPouch) }, r: 0.3 });
  B.add(plate(0.07, 0.028), 'label', { m: TR(-0.085, 0.2987, 0.045, -H, 0, 0.05), uv: { rect: A.add('monTag', 210, 84, drawTag) }, r: 0.5 });
  B.add(plate(0.6, 0.4), 'shadow', { m: TR(0, 0.0015, 0, -H, 0, 0), uv: 'keep' });
  const group = B.build({ shadow: true });
  // live parts
  const live = document.getElementById?.('monCanvas') || null, standby = canvasTex(standbyCanvas(), { wrap: false, mip: false });
  let liveTex = null, lw = 0, lh = 0;
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.25, emissive: 0xffffff, emissiveMap: standby, emissiveIntensity: 0.55 });
  const sc = MON.screen, screen = new THREE.Mesh(plate((sc[2] - sc[0]) / 1000, (sc[3] - sc[1]) / 1000), screenMat); screen.position.set(PX((sc[0] + sc[2]) / 2), PY((sc[1] + sc[3]) / 2), zf - 0.0003); group.add(screen);
  const bz = MON.bezel, glass = new THREE.Mesh(plate((bz[2] - bz[0]) / 1000, (bz[3] - bz[1]) / 1000), mats().glass); glass.position.set(PX((bz[0] + bz[2]) / 2), PY((bz[1] + bz[3]) / 2), zf + 0.0002); glass.renderOrder = 4; glass.userData.noAO = true; group.add(glass);
  const shockMat = new THREE.MeshStandardMaterial({ map: A.tex, emissiveMap: A.tex, emissive: 0xff5a20, emissiveIntensity: 0, roughness: 0.4 });
  { const g = disc(MON.shock[2] / 1000 * 0.97, 28), u = g.attributes.uv, r = sr([MON.shock[0] - MON.shock[2], MON.shock[1] - MON.shock[2], MON.shock[0] + MON.shock[2], MON.shock[1] + MON.shock[2]]); for (let i = 0; i < u.count; i++) u.setXY(i, r[0] + (r[2] - r[0]) * u.getX(i), r[1] + (r[3] - r[1]) * u.getY(i));
    const m = new THREE.Mesh(g, shockMat); m.position.set(sx, sy, zf + 0.0053); group.add(m); }
  const ledOn = new THREE.Mesh(disc(0.0016, 10), lit(0x38ff6a, 3)); ledOn.position.set(PX(MON.on[0] + 15), PY(MON.on[1] - 9), zf); group.add(ledOn);
  const ledChg = new THREE.Mesh(plate(0.07, 0.0022), lit(0xffc21a, 4)); ledChg.position.set(PX(301), PY(118.2), zf + 0.0002); ledChg.visible = false; group.add(ledChg);
  const ledSync = new THREE.Mesh(disc(0.0012, 8), lit(0xffb020, 4)); ledSync.position.set(PX((MON.small[0][0] + MON.small[0][2]) / 2), PY(MON.small[0][1] + 4), zf + 0.0046); ledSync.visible = false; group.add(ledSync);
  const ledPace = ledSync.clone(); ledPace.position.x = PX((MON.small[1][0] + MON.small[1][2]) / 2); group.add(ledPace);
  let acc = 1, on = false;
  return {
    group, half: [0.215, 0.115],
    ports: { ecg: { p: PP('ecg'), d: V3(-1, 0, 0) }, spo2: { p: PP('spo2'), d: V3(-1, 0, 0) }, nibp: { p: PP('nibp'), d: V3(-1, 0, 0) }, co2: { p: PP('co2'), d: V3(-1, 0, 0) }, therapy: { p: V3(tx, ty, zf + 0.044), d: V3(0, 0, 1) } },
    // on: something is attached, so the screen is live. defib: p.defib. t: seconds.
    update(dt, isOn, defib, t) {
      if (isOn !== on) { on = isOn; acc = 1; if (!on) { screenMat.emissiveMap = standby; screenMat.emissiveIntensity = 0.55; } }
      if (on && live && live.width > 8) {
        acc += dt;
        if (acc > 0.085) { acc = 0;
          if (!liveTex || live.width !== lw || live.height !== lh) { liveTex?.dispose(); liveTex = new THREE.CanvasTexture(live); liveTex.colorSpace = THREE.SRGBColorSpace; liveTex.generateMipmaps = false; liveTex.minFilter = THREE.LinearFilter; lw = live.width; lh = live.height; }
          liveTex.needsUpdate = true; if (screenMat.emissiveMap !== liveTex) { screenMat.emissiveMap = liveTex; screenMat.emissiveIntensity = 1.25; } }
      }
      const d = defib || {};
      shockMat.emissiveIntensity = d.charged ? 1.2 + 1.6 * (0.5 + 0.5 * Math.sin(t * 9)) : 0;
      ledChg.visible = !!(d.charging || d.charged) && (d.charged || Math.sin(t * 14) > 0); ledSync.visible = !!d.sync; ledPace.visible = d.mode === 'pacer';
      ledOn.material.emissiveIntensity = on ? 3 : 1;
    },
    dispose() { liveTex?.dispose(); standby.dispose(); screenMat.dispose(); shockMat.dispose(); },
  };
}

// ---------------------------------------------------------------- response bag

const POUCH = [['AIRWAY', 0x2a5fae, 'OPA · NPA · SGA · suction'], ['BREATHING', 0x2e8a4a, 'BVM · masks · neb · seals'], ['CIRCULATION', 0xb1241b, 'IV · IO · fluids · TQ'], ['MEDICATIONS', 0xe0b81f, 'controlled drugs in cab safe'], ['TRAUMA', 0xdf6a1c, 'dressings · binder · splints'], ['DIAGNOSTICS', 0x5a5f66, 'BGL · thermometer · penlight']];
function drawPouchLabel(name, col, sub) {
  return (g, w, h) => { g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h * 0.5);
    let fs = h * 0.3; g.font = `800 ${fs}px Arial`; const tw = g.measureText(name).width + name.length * 1.5; if (tw > w * 0.88) fs *= w * 0.88 / tw; txt(g, name, w / 2, h * 0.27, fs, { c: name === 'MEDICATIONS' ? '#1b1d20' : '#fff', sp: 1.5, w: 800 }); txt(g, sub, w / 2, h * 0.73, h * 0.15, { c: '#2c2f33', w: 600 }); grime(g, w, h, name.length, 1.2); };
}
function drawPatch(title, sub, bg, fg) {
  return (g, w, h) => { rr(g, 0, 0, w, h, 8, bg); rr(g, 5, 5, w - 10, h - 10, 5, null, fg, 2.5); const s = h * 0.33;
    // a plain six-armed emergency star
    g.save(); g.translate(h * 0.52, h / 2); g.fillStyle = fg; for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.fillRect(-s * 0.26, -s, s * 0.52, s * 2); } g.restore();
    txt(g, title, h * 1.02, h * 0.4, h * 0.34, { al: 'left', c: fg, w: 800, sp: 2 }); txt(g, sub, h * 1.02, h * 0.72, h * 0.16, { al: 'left', c: fg, w: 600, sp: 1 });
    for (let i = 0; i < w; i += 3) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(i, 0, 1, h); } };
}

export function buildBag() {
  const B = new Builder(), A = atlas(), red = C.bagRed, dark = 0x7e1711, blk = 0x18191b;
  // moulded base tub with skid ribs
  B.add(rbox(0.636, 0.052, 0.356, 0.018, 3), 'hard', { m: TR(0, 0.026, 0), c: 0x17181a, r: 0.85 });
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) B.add(rbox(0.014, 0.036, 0.006, 0.002), 'hard', { m: TR(-0.24 + i * 0.08, 0.024, s * 0.179), c: 0x1f2022, r: 0.9 });
  // walls: a padded ring, open at the top
  B.add(slab(roundRect(0.62, 0.34, 0.04, 6), 0.246, 0.003, [roundRect(0.588, 0.308, 0.026, 6)]), 'fabric', { m: TR(0, 0.169, 0, -H, 0, 0), c: red, r: 0.9 });
  B.add(box(0.585, 0.004, 0.305), 'fabric', { m: TR(0, 0.06, 0), c: 0x4d5055, r: 0.95 });
  // zip around the rim, sliders parked at the back corners
  const rim = roundRect(0.606, 0.326, 0.034, 5).map(p => V3(p[0], 0.293, p[1]));
  B.add(ribbon(rim, Y, 0.012, 0.002, true), 'web', { c: 0x0d0d0e, r: 0.6 });
  const puller = (x, y, z, ry, c = 0xb9bdc2) => { B.push(TR(x, y, z, 0, ry, 0)); B.add(rbox(0.009, 0.005, 0.012, 0.0015), 'hard', { c, r: 0.35, mt: 0.9 }); B.add(torus(0.004, 0.0009, 10, 5), 'hard', { m: TR(0, -0.003, 0.008, 0, H, 0), c, r: 0.35, mt: 0.9 });
    B.add(tube([V3(0, -0.006, 0.009), V3(0.002, -0.02, 0.012), V3(0, -0.034, 0.011)], 0.0016, 5, 6), 'hard', { c: 0x111112, r: 0.9 }); B.add(rbox(0.007, 0.018, 0.0035, 0.0015), 'hard', { m: TR(0, -0.043, 0.011), c: C.orange, r: 0.7 }); B.pop(); };
  puller(-0.3, 0.296, -0.12, -H); puller(0.3, 0.296, -0.1, H);
  // six colour-coded pouches standing in the main compartment, windows up
  POUCH.forEach(([name, col, sub], i) => { const cx = -0.193 + (i % 3) * 0.193, cz = (i < 3 ? -1 : 1) * 0.075, hgt = 0.186 + ((i * 7) % 3) * 0.006, top = 0.064 + hgt, tilt = ((i * 5) % 3 - 1) * 0.02;
    B.push(TR(cx, 0, cz, tilt, 0, tilt * 0.7));
    B.add(rbox(0.184, hgt, 0.14, 0.014, 3), 'fabric', { m: TR(0, 0.064 + hgt / 2, 0), c: col, r: 0.9 });
    B.add(ribbon(roundRect(0.172, 0.128, 0.012, 3).map(p => V3(p[0], top - 0.004, p[1])), Y, 0.006, 0.0024, true), 'web', { c: 0x0d0d0e, r: 0.6 });
    B.add(plate(0.13, 0.065), 'label', { m: TR(0, top + 0.0006, 0.004, -H, 0, 0), uv: { rect: A.add('pouch' + i, 286, 143, drawPouchLabel(name, col, sub)) }, r: 0.22 });
    B.add(ribbon([V3(-0.03, top - 0.002, -0.058), V3(-0.015, top + 0.012, -0.06), V3(0.015, top + 0.012, -0.06), V3(0.03, top - 0.002, -0.058)], Y, 0.016, 0.0018), 'web', { c: blk, r: 0.75 });
    B.add(rbox(0.008, 0.004, 0.011, 0.001), 'hard', { m: TR(0.07, top - 0.002, 0.066), c: 0xb9bdc2, r: 0.35, mt: 0.9 });
    B.pop(); });
  // lid, standing open on its gusset straps: outside faces back
  const lidM = TR(0, 0.296, -0.166, -1.78, 0, 0);
  B.push(lidM);
  B.add(rbox(0.62, 0.04, 0.34, 0.02, 3), 'fabric', { m: TR(0, 0.022, 0.17), c: red, r: 0.9 });
  B.add(ribbon(roundRect(0.606, 0.326, 0.034, 5).map(p => V3(p[0], 0.003, p[1] + 0.17)), Y, 0.012, 0.002, true), 'web', { c: 0x0d0d0e, r: 0.6 });
  B.add(box(0.57, 0.002, 0.29), 'fabric', { m: TR(0, 0.0015, 0.17), c: 0x595d63, r: 0.95 });
  // inside of the lid: two clear zip pockets
  for (const s of [-1, 1]) { B.add(plate(0.262, 0.25), 'clear', { m: TR(s * 0.142, -0.0115, 0.17, H, 0, 0), c: 0xe8f0f4, a: 0.05, r: 0.1 });
    B.add(ribbon(roundRect(0.266, 0.254, 0.01, 2).map(p => V3(p[0] + s * 0.142, -0.001, p[1] + 0.17)), Y, 0.007, 0.0016, true), 'web', { c: blk, r: 0.8 }); B.add(ribbon([V3(s * 0.142 - 0.125, -0.008, 0.07), V3(s * 0.142 + 0.125, -0.008, 0.07)], Y, 0.006, 0.002), 'web', { c: 0x0d0d0e, r: 0.6 }); }
  // left pocket: a graded set of oral airways
  [[0xe8e8e3, 0.05], [0x2e8a4a, 0.06], [0xdf8a1c, 0.07], [0xb1241b, 0.08]].forEach(([col, len], i) => { const x = -0.235 + i * 0.062; B.push(TR(x, -0.005, 0.2, 0, 0, 0));
    B.add(tube([V3(0, 0, -len * 0.55), V3(0.004, 0, -len * 0.2), V3(0.014, 0, len * 0.2), V3(0.034, 0, len * 0.42), V3(0.048, 0, len * 0.36)], 0.0042, 6, 14), 'hard', { c: 0xdcdcd4, r: 0.35 }); B.add(rbox(0.024, 0.008, 0.005, 0.002), 'hard', { m: TR(0, 0, -len * 0.56), c: col, r: 0.4 }); B.add(rbox(0.012, 0.0085, 0.016, 0.002), 'hard', { m: TR(0, 0, -len * 0.47), c: col, r: 0.4 }); B.pop(); });
  // right pocket: tape, shears, cannula packs, flushes
  B.add(cyl(0.024, 0.024, 0.008, 20, true), 'gauze', { m: TR(0.06, -0.005, 0.25), c: 0xf0ede4, r: 0.8 }); B.add(cyl(0.015, 0.015, 0.0082, 16, true), 'hard', { m: TR(0.06, -0.005, 0.25), c: 0xb9a482, r: 0.8 });
  B.add(cyl(0.02, 0.02, 0.008, 20, true), 'hard', { m: TR(0.115, -0.005, 0.255), c: 0xdfe6ea, r: 0.25 }); B.add(cyl(0.013, 0.013, 0.0082, 16, true), 'hard', { m: TR(0.115, -0.005, 0.255), c: 0xb9a482, r: 0.8 });
  B.add(rbox(0.012, 0.004, 0.105, 0.002), 'hard', { m: TR(0.2, -0.004, 0.145, 0, 0.12, 0), c: 0xb9bdc2, r: 0.3, mt: 0.9 }); B.add(rbox(0.012, 0.004, 0.105, 0.002), 'hard', { m: TR(0.213, -0.004, 0.145, 0, -0.08, 0), c: 0xb9bdc2, r: 0.3, mt: 0.9 });
  for (const sx of [0.188, 0.224]) B.add(torus(0.015, 0.0045, 14, 6), 'hard', { m: TR(sx, -0.005, 0.215, H, 0, 0), c: 0x17181a, r: 0.6 });
  for (let i = 0; i < 3; i++) { B.add(rbox(0.036, 0.004, 0.095, 0.002), 'hard', { m: TR(0.045 + i * 0.042, -0.004, 0.135, 0, 0.03 * (i - 1), 0), c: 0xf0f0ec, r: 0.6 }); B.add(rbox(0.036, 0.0042, 0.02, 0.002), 'hard', { m: TR(0.045 + i * 0.042, -0.004, 0.172, 0, 0.03 * (i - 1), 0), c: [C.green, C.pink, 0x8b9096][i], r: 0.6 }); }
  for (let i = 0; i < 2; i++) { B.add(cyl(0.0075, 0.0075, 0.075, 12), 'tubing', { m: TR(0.165 + i * 0.022, -0.006, 0.26, H, 0, 0.0), c: 0xdfeaf2, a: 0.3, r: 0.1 }); B.add(cyl(0.0078, 0.0078, 0.012, 12), 'hard', { m: TR(0.165 + i * 0.022, -0.006, 0.298, H, 0, 0), c: 0xe8e8e3, r: 0.5 }); }
  // outside of the lid: grab handle, patch, reflective trim
  B.add(ribbon([V3(-0.09, 0.043, 0.17), V3(-0.06, 0.068, 0.17), V3(0.06, 0.068, 0.17), V3(0.09, 0.043, 0.17)], Y, 0.03, 0.003), 'web', { c: blk, r: 0.75 }); B.add(rbox(0.11, 0.012, 0.036, 0.005), 'fuzz', { m: TR(0, 0.068, 0.17), c: 0x101112, r: 0.95 });
  B.add(plate(0.21, 0.058), 'label', { m: TR(0, 0.0426, 0.08, -H, 0, Math.PI), uv: { rect: A.add('patchALS', 441, 122, drawPatch('PARAMEDIC', 'KETTER COUNTY EMS · MEDIC 14', '#101b2d', '#f1f1ea')) }, r: 0.8 });
  for (const [z, w, col, mt] of [[0.268, 0.011, 0xd8dd3a, 0], [0.28, 0.02, 0xd9dcd6, 0.5], [0.292, 0.011, 0xd8dd3a, 0]]) B.add(box(0.58, 0.0012, w), 'fuzz', { m: TR(0, 0.0424, z + 0.005), c: col, r: mt ? 0.32 : 0.6, mt, s: 3 });
  const lidHook = V3(0.2, 0.02, 0.338);
  B.add(ribbon([V3(0.2, 0.03, 0.325), V3(0.2, 0.022, 0.345), V3(0.2, 0.012, 0.325)], Z, 0.018, 0.002), 'web', { c: blk, r: 0.75 });
  B.pop();
  lidHook.applyMatrix4(lidM);
  for (const s of [-1, 1]) { const a = V3(s * 0.304, 0.02, 0.2).applyMatrix4(lidM), b = V3(s * 0.304, 0.29, 0.02); B.add(ribbon([a, a.clone().lerp(b, 0.5).add(V3(0, -0.012, -0.012)), b], V3(s, 0, 0), 0.02, 0.0018), 'web', { c: blk, r: 0.75 }); }
  // front pocket with flap, zip, patch and reflective trim
  B.add(rbox(0.45, 0.165, 0.04, 0.016, 3), 'fabric', { m: TR(0, 0.142, 0.183), c: red, r: 0.9 }); B.add(rbox(0.456, 0.03, 0.044, 0.012, 3), 'fabric', { m: TR(0, 0.226, 0.183), c: dark, r: 0.9 });
  B.add(ribbon([V3(-0.215, 0.209, 0.2045), V3(0.215, 0.209, 0.2045)], Z, 0.008, 0.002), 'web', { c: 0x0d0d0e, r: 0.6 }); puller(0.19, 0.209, 0.207, 0);
  for (const [y, w, col, mt] of [[0.164, 0.01, 0xd8dd3a, 0], [0.1765, 0.02, 0xd9dcd6, 0.5], [0.189, 0.01, 0xd8dd3a, 0]]) { B.add(box(0.44, w, 0.0012), 'fuzz', { m: TR(0, y, 0.2036), c: col, r: mt ? 0.32 : 0.6, mt, s: 3 }); B.add(box(0.56, w, 0.0012), 'fuzz', { m: TR(0, y + 0.03, -0.1738), c: col, r: mt ? 0.32 : 0.6, mt, s: 3 }); }
  B.add(plate(0.19, 0.052), 'label', { m: TR(-0.1, 0.105, 0.2036), uv: { rect: A.rect('patchALS') }, r: 0.8 });
  // a strip of cloth tape with the crew's check written on it
  B.add(plate(0.1, 0.022), 'label', { m: TR(0.13, 0.1, 0.2037, 0, 0, 0.05), uv: { rect: A.add('bagTape', 250, 55, (g, w, h) => { g.fillStyle = '#ebe6d6'; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 2) { g.fillStyle = 'rgba(120,110,90,0.08)'; g.fillRect(i, 0, 1, h); } txt(g, 'CHK 11/24 RK ✓', w / 2, h / 2 + 2, h * 0.6, { c: '#16171c', f: HAND, rot: -0.02 }); }) }, r: 0.85 });
  // end pockets with grab handles; the shoulder strap is clipped at one end and lies where it fell
  for (const s of [-1, 1]) { B.add(rbox(0.034, 0.15, 0.2, 0.014, 3), 'fabric', { m: TR(s * 0.318, 0.14, 0), c: red, r: 0.9 }); B.add(ribbon([V3(s * 0.3355, 0.2, -0.085), V3(s * 0.3355, 0.2, 0.085)], V3(s, 0, 0), 0.008, 0.002), 'web', { c: 0x0d0d0e, r: 0.6 });
    B.add(ribbon([V3(s * 0.334, 0.165, -0.06), V3(s * 0.362, 0.172, -0.03), V3(s * 0.366, 0.174, 0.03), V3(s * 0.334, 0.165, 0.06)], V3(s, 0.3, 0).normalize(), 0.028, 0.0028), 'web', { c: blk, r: 0.75 });
    B.add(torus(0.012, 0.0022, 14, 6), 'hard', { m: TR(s * 0.312, 0.262, -0.12, 0.5, H, 0), c: 0xb9bdc2, r: 0.3, mt: 1 }); }
  { const pts = [V3(-0.322, 0.252, -0.122), V3(-0.356, 0.15, -0.135), V3(-0.39, 0.03, -0.13), V3(-0.43, 0.0035, -0.09), V3(-0.5, 0.0035, 0.0), V3(-0.49, 0.0035, 0.1), V3(-0.42, 0.0035, 0.165), V3(-0.36, 0.0035, 0.21), V3(-0.33, 0.0035, 0.27)];
    const c = new THREE.CatmullRomCurve3(pts), P = c.getSpacedPoints(40), N = P.map((p, i) => i < 9 ? V3(-1, 0.25, -0.2).normalize() : i < 13 ? V3(-0.5, 0.85, 0).normalize() : Y);
    B.add(ribbon(P, N, 0.038, 0.0022), 'web', { c: blk, r: 0.75 });
    B.add(rbox(0.06, 0.012, 0.19, 0.005), 'fuzz', { m: TR(-0.497, 0.009, 0.045, 0, -0.12, 0), c: 0x101112, r: 0.95 });
    B.add(torus(0.011, 0.0022, 12, 6, Math.PI * 1.6), 'hard', { m: TR(-0.322, 0.0045, 0.292, H, 0, 1.2), c: 0xb9bdc2, r: 0.3, mt: 1 }); B.add(rbox(0.012, 0.005, 0.03, 0.002), 'hard', { m: TR(-0.327, 0.004, 0.276, 0, 0.2, 0), c: 0xb9bdc2, r: 0.3, mt: 1 }); }
  B.add(plate(0.86, 0.6), 'shadow', { m: TR(0, 0.0015, -0.02, -H, 0, 0), uv: 'keep' });
  return { group: B.build({ shadow: true }), lidHook, half: [0.34, 0.21] };
}

// ---------------------------------------------------------------- oxygen: barrel bag, D cylinder, regulator

function drawGauge(g, w) {
  const c = w / 2; circ(g, c, c, c, '#f3f3ee'); g.lineCap = 'butt';
  const ang = v => Math.PI * 0.75 + v / 3000 * Math.PI * 1.5;
  g.strokeStyle = '#c62a1c'; g.lineWidth = w * 0.07; g.beginPath(); g.arc(c, c, c * 0.8, ang(0), ang(500)); g.stroke(); g.strokeStyle = '#2e8a4a'; g.beginPath(); g.arc(c, c, c * 0.8, ang(500), ang(3000)); g.stroke();
  for (let v = 0; v <= 3000; v += 250) { const a = ang(v), big = v % 500 === 0; g.strokeStyle = '#111'; g.lineWidth = big ? 2.2 : 1.1; g.beginPath(); g.moveTo(c + Math.cos(a) * c * (big ? 0.62 : 0.7), c + Math.sin(a) * c * (big ? 0.62 : 0.7)); g.lineTo(c + Math.cos(a) * c * 0.86, c + Math.sin(a) * c * 0.86); g.stroke(); if (v % 1000 === 0) txt(g, String(v), c + Math.cos(a) * c * 0.44, c + Math.sin(a) * c * 0.44, w * 0.1, { c: '#111' }); }
  txt(g, 'psi', c, c * 1.42, w * 0.085, { c: '#333', w: 600 }); txt(g, 'USE NO OIL', c, c * 1.64, w * 0.062, { c: '#c62a1c' }); txt(g, 'O₂', c, c * 0.62, w * 0.13, { c: '#2e8a4a', w: 800 });
  const a = ang(1850); g.strokeStyle = '#111'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(c - Math.cos(a) * c * 0.15, c - Math.sin(a) * c * 0.15); g.lineTo(c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72); g.stroke(); circ(g, c, c, w * 0.05, '#111');
}
function drawO2Patch(g, w, h) {      // drawn sideways: it is wrapped round the bag with the long edge along the cylinder
  g.fillStyle = '#f1f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f8a4c'; g.fillRect(4, 4, w - 8, h - 8);
  g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); txt(g, 'OXYGEN', 0, -w * 0.08, w * 0.42, { c: '#f1f1ea', w: 800, sp: 4 }); txt(g, 'MEDICAL · D CYLINDER · NO SMOKING', 0, w * 0.26, w * 0.105, { c: '#f1f1ea', w: 600, sp: 1 }); g.restore();
  for (let i = 0; i < h; i += 3) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, i, w, 1); }
}
function drawFlow(g, w, h) {         // numbers round the flow selector, wrapped once round the knob
  g.fillStyle = '#0d0e0f'; g.fillRect(0, 0, w, h); const steps = ['0', '½', '1', '2', '3', '4', '6', '8', '10', '12', '15', '25'];
  steps.forEach((s, i) => txt(g, s, (i + 0.5) / steps.length * w, h / 2, h * 0.62, { c: s === '15' ? '#7dffa0' : '#f1f1ea' }));
}

export function buildOxygen() {
  const B = new Builder(), A = atlas(), sleeve = 0x1b5a36, blk = 0x18191b, R = 0.056, cy = 0.074;
  B.push(TR(0, cy, 0, 0, 0, -H));          // local +Y of the parts below runs along the bag's +X
  // padded sleeve with a closed foot and a drawn collar
  B.add(cyl(0.071, 0.071, 0.36, 24, true), 'fabric', { m: TR(0, -0.04, 0, 0, 0, 0, 1, 1, 0.96), c: sleeve, r: 0.9 });
  B.add(sph(0.071, 24, 8, 0, Math.PI * 2, H, H), 'fabric', { m: TR(0, -0.22, 0, 0, 0, 0, 1, 0.45, 0.96), c: sleeve, r: 0.9 });
  B.add(torus(0.069, 0.007, 24, 8), 'fabric', { m: TR(0, 0.14, 0, H, 0, 0), c: 0x154729, r: 0.9 });
  B.add(cyl(0.0712, 0.0712, 0.19, 12, true, Math.PI * 1.75 - 0.5, 1.0), 'label', { m: TR(0, -0.05, 0, 0, 0, 0, 1, 1, 0.96), uv: { rect: A.add('patchO2', 150, 400, drawO2Patch) }, r: 0.8 });
  B.add(cyl(0.0712, 0.0712, 0.19, 12, true, Math.PI * 1.25 - 0.5, 1.0), 'label', { m: TR(0, -0.05, 0, 0, 0, 0, 1, 1, 0.96), uv: { rect: A.add('patchO2b', 150, 400, (g, w, h) => { g.translate(w, h); g.rotate(Math.PI); drawO2Patch(g, w, h); }) }, r: 0.8 });
  for (const [y, w, col, mt] of [[-0.185, 0.012, 0xd8dd3a, 0], [-0.17, 0.016, 0xd9dcd6, 0.5]]) B.add(cyl(0.0716, 0.0716, w, 24, true), 'fuzz', { m: TR(0, y, 0, 0, 0, 0, 1, 1, 0.96), c: col, r: mt ? 0.32 : 0.6, mt, s: 3 });
  // cylinder: brushed aluminium, green shoulder, post valve
  B.add(cyl(R, R, 0.07, 28, true), 'hard', { m: TR(0, 0.17, 0), c: 0xb7bbc0, r: 0.36, mt: 0.95 });
  B.add(lathe([[R, 0.205], [R * 0.985, 0.22], [R * 0.9, 0.24], [R * 0.72, 0.256], [R * 0.5, 0.266], [0.02, 0.272], [0.0155, 0.276], [0.0155, 0.29], [0.012, 0.292]], 28), 'hard', { c: C.o2green, r: 0.42, mt: 0.15 });
  B.add(rbox(0.026, 0.05, 0.022, 0.003), 'hard', { m: TR(0, 0.312, 0), c: 0xc9b06a, r: 0.3, mt: 1 }); B.add(cyl(0.0045, 0.0045, 0.014, 10), 'hard', { m: TR(0, 0.343, 0), c: 0xb9bdc2, r: 0.3, mt: 1 });
  B.add(rbox(0.008, 0.006, 0.03, 0.002), 'hard', { m: TR(0, 0.351, 0), c: 0x17181a, r: 0.6 });
  // regulator: yoke over the post with a T-handle, gauge on top, click-stop flow selector, barbed outlet
  B.add(slab(roundRect(0.05, 0.054, 0.008, 4), 0.026, 0.002, [roundRect(0.03, 0.03, 0.003, 2)]), 'hard', { m: TR(0, 0.312, 0, H, 0, 0), c: 0x2e7d52, r: 0.38, mt: 0.85 });
  B.add(cyl(0.004, 0.004, 0.03, 10), 'hard', { m: TR(-0.036, 0.312, 0, 0, 0, H), c: 0xb9bdc2, r: 0.3, mt: 1 }); B.add(cyl(0.0035, 0.0035, 0.04, 8), 'hard', { m: TR(-0.052, 0.312, 0, H, 0, 0), c: 0xb9bdc2, r: 0.3, mt: 1 });
  B.pop();
  // in the bag's own frame (cylinder along +X): body out to the side, gauge facing up, selector on the end, barbed outlet
  const gx = 0.312, gz = 0.052;
  B.add(cyl(0.021, 0.021, 0.07, 24), 'hard', { m: TR(gx, cy, gz, H, 0, 0), c: 0x2e7d52, r: 0.38, mt: 0.85 });
  B.add(cyl(0.024, 0.024, 0.018, 28), 'hard', { m: TR(gx, cy + 0.027, gz), c: 0x17181a, r: 0.5 }); B.add(torus(0.0235, 0.0022, 28, 6), 'hard', { m: TR(gx, cy + 0.036, gz, H, 0, 0), c: 0xc8cdd2, r: 0.2, mt: 1 });
  B.add(disc(0.022, 28), 'label', { m: TR(gx, cy + 0.0364, gz, -H, 0, -H), uv: { rect: A.add('gauge', 180, 180, drawGauge) }, r: 0.5 });
  B.add(disc(0.0225, 28), 'clear', { m: TR(gx, cy + 0.0378, gz, -H, 0, 0), c: 0xffffff, a: 0.08, r: 0.05 });
  B.add(cyl(0.0226, 0.0226, 0.009, 28, true), 'label', { m: TR(gx, cy, gz + 0.036, H, 0, 0), uv: { rect: A.add('flow', 384, 24, drawFlow) }, r: 0.5 });
  B.add(cyl(0.025, 0.025, 0.02, 28), 'hard', { m: TR(gx, cy, gz + 0.05, H, 0, 0), c: 0x141516, r: 0.6 });
  for (let i = 0; i < 18; i++) { const an = i / 18 * Math.PI * 2; B.add(box(0.003, 0.003, 0.018), 'hard', { m: TR(gx + Math.cos(an) * 0.0255, cy + Math.sin(an) * 0.0255, gz + 0.05, 0, 0, an), c: 0x1f2123, r: 0.8 }); }
  B.add(cyl(0.0035, 0.0055, 0.008, 12), 'hard', { m: TR(gx + 0.024, cy - 0.004, gz - 0.008, 0, 0, -H), c: 0xb9bdc2, r: 0.3, mt: 1 });
  for (let i = 0; i < 4; i++) B.add(cyl(0.0028 + 0.0003 * i, 0.0042, 0.005, 10), 'hard', { m: TR(gx + 0.047 - i * 0.0052, cy - 0.004, gz - 0.008, 0, 0, -H), c: C.o2green, r: 0.45 });
  // zip along the top, carry handle, shadow
  B.add(ribbon([V3(-0.2, cy + 0.0685, 0), V3(0.12, cy + 0.0685, 0)], Y, 0.009, 0.002), 'web', { c: 0x0d0d0e, r: 0.6 });
  B.add(rbox(0.012, 0.005, 0.009, 0.0015), 'hard', { m: TR(0.1, cy + 0.071, 0), c: 0xb9bdc2, r: 0.35, mt: 0.9 }); B.add(rbox(0.018, 0.0035, 0.007, 0.0015), 'hard', { m: TR(0.117, cy + 0.066, 0.012, 0.6, 0, 0), c: C.orange, r: 0.7 });
  { const P = new THREE.CatmullRomCurve3([V3(-0.15, cy + 0.06, 0.03), V3(-0.12, cy + 0.085, 0.055), V3(-0.04, cy + 0.07, 0.085), V3(0.04, cy + 0.03, 0.098), V3(0.08, cy + 0.045, 0.08), V3(0.1, cy + 0.058, 0.035)]).getSpacedPoints(24);
    B.add(ribbon(P, P.map(p => V3(0, p.y - cy, p.z).normalize()), 0.028, 0.0024), 'web', { c: blk, r: 0.75 }); }
  B.add(plate(0.74, 0.3), 'shadow', { m: TR(0.03, 0.0015, 0, -H, 0, 0), uv: 'keep' });
  return { group: B.build({ shadow: true }), outlet: { p: V3(gx + 0.05, cy - 0.004, gz - 0.008), d: V3(1, 0, 0) }, half: [0.36, 0.09] };
}

// ---------------------------------------------------------------- small things on the floor by the bag

function drawSharps(g, w, h) {
  g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c62a1c'; g.fillRect(0, 0, w, h * 0.22); txt(g, 'SHARPS', w / 2, h * 0.12, h * 0.14, { c: '#fff', sp: 3, w: 800 });
  const cx = w / 2, cyy = h * 0.52, r = w * 0.17; g.strokeStyle = '#111'; g.lineWidth = w * 0.045; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.75, cyy + Math.sin(a) * r * 0.75, r * 0.72, a - 2.2, a + 2.2); g.stroke(); }
  circ(g, cx, cyy, r * 0.38, '#f3efe2', '#111', w * 0.035); txt(g, 'BIOHAZARD', w / 2, h * 0.82, h * 0.085, { c: '#111', sp: 1.5 }); txt(g, 'DO NOT FILL ABOVE LINE', w / 2, h * 0.92, h * 0.05, { c: '#111', w: 600 });
}
export function buildSharps() {
  const B = new Builder(), A = atlas();
  B.add(rbox(0.07, 0.15, 0.05, 0.012, 3), 'hard', { m: TR(0, 0.075, 0), c: 0xb5271c, r: 0.35 });
  B.add(rbox(0.074, 0.02, 0.054, 0.008, 3), 'hard', { m: TR(0, 0.156, 0), c: 0xe9e6dc, r: 0.4 }); B.add(rbox(0.04, 0.008, 0.03, 0.003), 'hard', { m: TR(0.004, 0.168, 0), c: 0xd7d3c6, r: 0.45 });
  B.add(plate(0.052, 0.07), 'label', { m: TR(0, 0.078, 0.0255), uv: { rect: A.add('sharps', 156, 210, drawSharps) }, r: 0.5 });
  B.add(plate(0.2, 0.17), 'shadow', { m: TR(0, 0.0015, 0, -H, 0, 0), uv: 'keep' });
  return { group: B.build({ shadow: false }) };
}
