// The pit-lane set, baked per track: scenery, grandstand, main straight, pit wall, lane, boxes, garages.
import { canvas, rect, ellipse, poly, ditherRect, dith, shade, mix, outline, W } from './gfx.js';
import { TEAMS } from './data.js';
import { text } from './font.js';

// Vertical layout of the scene (screen y).
export const Y = {
  top: 12, scenery: 12, stand: 30, fence: 44, straight: 48, straightMid: 59, curb: 70, wall: 74,
  lane: 82, laneMid: 96, work: 110, box: 142, garage: 172, panel: 216,
};
export const BOX_X = 256;      // centre of our box
export const RIVAL_BOXES = [{ x: 96, team: 2 }, { x: 416, team: 1 }];

const THEMES = {
  harbour: { asphalt: '#4a4e58', lane: '#5a5f6a', grass: '#3f8a46', scen: 'harbour', tint: null, crowd: 1 },
  forest:  { asphalt: '#45494f', lane: '#565a62', grass: '#2f6a34', scen: 'forest', tint: null, crowd: 0.8 },
  desert:  { asphalt: '#5a5048', lane: '#6a6058', grass: '#c89a5a', scen: 'desert', tint: ['#ff9a50', 0.16], crowd: 0.7 },
  alpine:  { asphalt: '#4c5058', lane: '#5c6068', grass: '#dfe8f0', scen: 'alpine', tint: ['#a8c8ff', 0.1], crowd: 0.6 },
  neon:    { asphalt: '#30323c', lane: '#3a3c48', grass: '#20302a', scen: 'neon', tint: ['#202060', 0.45], crowd: 1, night: true },
  sunset:  { asphalt: '#4e4a52', lane: '#5e5a62', grass: '#4a8a40', scen: 'sunset', tint: ['#ff7a3a', 0.2], crowd: 1 },
};

// A race can run at another time of day than its track usually does (long season repeats).
const TIME_LIGHT = {
  day: { tint: null, night: false },
  dusk: { tint: ['#ff9a50', 0.16], night: false },
  sunset: { tint: ['#ff7a3a', 0.2], night: false },
  night: { tint: ['#202060', 0.45], night: true },
};
const NATIVE = { harbour: 'day', forest: 'day', desert: 'dusk', alpine: 'day', neon: 'night', sunset: 'sunset' };
export function theme(track) {
  const th = THEMES[track.theme];
  if (!track.time || track.time === NATIVE[track.theme]) return th;
  return { ...th, ...TIME_LIGHT[track.time] };
}

let seedv = 1;
const rnd = () => { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; };

// Behind the grandstand you look out, not down: sky to the horizon, with the local
// landmarks (masts, treetops, palms, peaks, towers) standing just proud of the stands.
// Rain in the forecast turns the sky overcast with low dark cloud.
const SKY = {
  day:    { clear: ['#4f9de6', '#bfe2f6'], grey: ['#6a7078', '#a4a9b0'] },
  dusk:   { clear: ['#3e3470', '#f2925a'], grey: ['#3c3a44', '#8a7468'] },
  sunset: { clear: ['#5a3f86', '#ffb26c'], grey: ['#40384a', '#9a7a6c'] },
  night:  { clear: ['#070a1c', '#1e2650'], grey: ['#0c0e12', '#24272e'] },
};
const NATIVE_TIME = { harbour: 'day', forest: 'day', desert: 'dusk', alpine: 'day', neon: 'night', sunset: 'sunset' };

function cloud(g, x, y, w, body, top) {
  ellipse(g, x, y, w * 0.5, w * 0.16, body);
  ellipse(g, x - w * 0.18, y - w * 0.07, w * 0.22, w * 0.12, body);
  ellipse(g, x + w * 0.14, y - w * 0.09, w * 0.2, w * 0.13, body);
  rect(g, x - w * 0.22, y - w * 0.17, w * 0.3, 1, top);
}

function scenery(g, th, kind, track) {
  const y0 = Y.scenery, h = Y.stand - Y.scenery, hz = Y.stand - 4; // horizon line
  const time = track.time || NATIVE_TIME[track.theme] || 'day';
  const grey = track.weather && track.weather.some(w => w.wet);
  const [top, low] = SKY[time][grey ? 'grey' : 'clear'];
  const night = time === 'night';
  for (let y = y0; y < Y.stand; y++) rect(g, 0, y, W, 1, mix(top, low, (y - y0) / h));
  if (night && !grey) for (let i = 0; i < 70; i++) rect(g, rnd() * W | 0, y0 + rnd() * (h - 6) | 0, 1, 1, rnd() < 0.3 ? '#ffffff' : '#8890b8');
  if (time === 'sunset' && !grey) { ellipse(g, 380, hz, 9, 9, '#ffe08a'); ellipse(g, 380, hz, 7, 7, '#fff2c0'); }
  if (time === 'dusk' && !grey) ellipse(g, 120, hz + 1, 7, 6, '#ffc070');
  // clouds: a few fair-weather puffs, or a low, dark overcast when rain is due
  if (grey) {
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = y0 + 1 + rnd() * 7, w = 30 + rnd() * 50;
      cloud(g, x, y, w, night ? ['#1a1c22', '#22252c'][i % 2] : ['#4a4e56', '#5a5e66', '#3e424a'][i % 3], night ? '#2c3038' : '#7a7e86');
    }
  } else if (!night) {
    const body = time === 'day' ? '#f4f8fc' : '#f8c8a8', topc = time === 'day' ? '#ffffff' : '#ffe0c0';
    for (let i = 0; i < 7; i++) cloud(g, rnd() * W, y0 + 3 + rnd() * 5, 20 + rnd() * 26, body, topc);
  }
  const sil = (c, k = 0.55) => night ? shade(c, -0.75) : grey ? shade(c, -0.3) : shade(c, -k * 0.4);
  if (kind === 'harbour' || kind === 'sunset') {
    // sea to the horizon, boats on it, masts above
    rect(g, 0, hz, W, Y.stand - hz, night ? '#0c1a34' : grey ? '#3a5068' : kind === 'sunset' ? '#3a6aa0' : '#2a6ab0');
    for (let x = 0; x < W; x += 5) rect(g, x + (rnd() * 3 | 0), hz + 1 + (rnd() * 2 | 0), 2, 1, night ? '#2a3a5a' : '#8ab8e0');
    if (kind === 'harbour') for (let i = 0; i < 12; i++) {
      const x = 12 + i * 42 + rnd() * 14;
      rect(g, x, hz - 2, 18, 3, sil('#f4f4f0', 0.1)); rect(g, x + 4, hz - 4, 8, 2, sil('#dfe6ee', 0.1));
      if (i % 2 === 0) { rect(g, x + 8, hz - 13, 1, 9, sil('#d8d8d8', 0.2)); poly(g, [[x + 9, hz - 12], [x + 15, hz - 6], [x + 9, hz - 6]], sil('#f8f8f8', 0.1)); }
      if (night) rect(g, x + 6, hz - 3, 2, 1, '#ffe08a');
    }
    if (kind === 'sunset') for (let i = 0; i < 9; i++) {
      const x = 20 + i * 58 + rnd() * 16, tt = hz - 10 - rnd() * 4;
      rect(g, x, tt, 1, Y.stand - tt, sil('#5a3a1a'));
      for (let a = 0; a < 6; a++) { const ang = Math.PI + 0.15 + a / 5 * (Math.PI - 0.3); poly(g, [[x, tt], [x + Math.cos(ang) * 8, tt - Math.sin(ang) * 3 + 3], [x + Math.cos(ang + 0.3) * 6, tt - Math.sin(ang + 0.3) * 2 + 3]], sil('#1f5a2a')); }
    }
  } else if (kind === 'forest') {
    // a line of pine tops just over the stands
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, tip = hz - 4 - rnd() * 8, wdt = 4 + rnd() * 4;
      poly(g, [[x, tip], [x + wdt, Y.stand], [x - wdt, Y.stand]], sil(['#1f4a24', '#2a5e2e', '#173c1c'][i % 3]));
    }
  } else if (kind === 'desert') {
    for (let i = 0; i < 5; i++) ellipse(g, rnd() * W, hz + 3, 60 + rnd() * 40, 4, sil('#d89a5a', 0.2));
    rect(g, 0, hz + 2, W, Y.stand - hz - 2, sil('#c88850', 0.2));
    for (let i = 0; i < 11; i++) {
      const x = 14 + i * 47 + rnd() * 14, tt = hz - 9 - rnd() * 5;
      rect(g, x, tt, 1, Y.stand - tt, sil('#6a4a2a'));
      for (let a = 0; a < 6; a++) { const ang = Math.PI + 0.15 + a / 5 * (Math.PI - 0.3); poly(g, [[x, tt], [x + Math.cos(ang) * 8, tt - Math.sin(ang) * 3 + 3], [x + Math.cos(ang + 0.3) * 6, tt - Math.sin(ang + 0.3) * 2 + 3]], sil('#3a7a3a')); }
    }
  } else if (kind === 'alpine') {
    // peaks behind, snow on top, pines at their feet
    for (let i = 0; i < 9; i++) {
      const x = i * 64 + rnd() * 30, pk = y0 + 1 + rnd() * 5, wdt = 34 + rnd() * 20;
      poly(g, [[x, pk], [x + wdt, Y.stand], [x - wdt, Y.stand]], sil('#6a7488', 0.3));
      poly(g, [[x, pk], [x + wdt * 0.28, pk + 5], [x + 4, pk + 4], [x - 3, pk + 6], [x - wdt * 0.28, pk + 5]], night ? '#8a90a8' : '#f4f8ff');
    }
    for (let i = 0; i < 50; i++) { const x = rnd() * W, tip = hz - 2 - rnd() * 5; poly(g, [[x, tip], [x + 3, Y.stand], [x - 3, Y.stand]], sil('#1f4a34')); }
  } else if (kind === 'neon') {
    // skyline: towers with lit windows and signs
    for (let x = -4; x < W;) {
      const w = 14 + rnd() * 26 | 0, tt = y0 + 1 + rnd() * 10 | 0;
      const c = night ? ['#141624', '#1a1c2c', '#10121e'][rnd() * 3 | 0] : sil(['#5a6070', '#6a7080', '#4a5060'][rnd() * 3 | 0], 0.2);
      rect(g, x, tt, w - 1, Y.stand - tt, c);
      for (let wy = tt + 2; wy < Y.stand - 1; wy += 3) for (let wx = x + 2; wx < x + w - 3; wx += 3) if (rnd() < (night ? 0.45 : 0.15)) rect(g, wx, wy, 1, 1, night ? (rnd() < 0.8 ? '#ffe08a' : '#8ae0ff') : '#2a2e38');
      if (rnd() < 0.4) rect(g, x + 2, tt + 2, w - 5, 1, night ? ['#ff3aa8', '#30e8ff', '#a8ff30', '#ffb030'][rnd() * 4 | 0] : '#8a8e98');
      x += w;
    }
  }
}

export function bake(track) {
  seedv = 1 + track.id.length * 977 + track.id.charCodeAt(0) * 31;
  const th = theme(track);
  const [c, g] = canvas(W, Y.panel);
  rect(g, 0, 0, W, Y.panel, '#000');
  scenery(g, th, th.scen, track);
  // grandstand: stepped rows with a crowd
  for (let r = 0; r < 4; r++) {
    const y = Y.stand + r * 3.5 | 0;
    rect(g, 0, y, W, 4, shade('#8a8e98', -r * 0.08));
    for (let x = 0; x < W; x += 2) if (rnd() < 0.85 * th.crowd) rect(g, x, y + 1, 2, 2, ['#e84a3a', '#f0f0f0', '#3a7ae8', '#f2c218', '#16b3a3', '#ff8a1e', '#2a2a2a', '#e8b890'][rnd() * 8 | 0]);
  }
  rect(g, 0, Y.stand, W, 1, '#b8bcc8');
  // fence and wall
  rect(g, 0, Y.fence, W, 4, '#c8ccd4');
  for (let x = 0; x < W; x += 3) rect(g, x, Y.fence, 1, 3, '#8a8e98');
  rect(g, 0, Y.fence + 3, W, 1, '#6a6e78');
  // sponsor boards along the wall
  for (let x = 6, k = 0; x < W; x += 84, k++) {
    rect(g, x, Y.fence, 70, 4, ['#16b3a3', '#d42a24', '#2457d6', '#e8c33a', '#f2f2f2', '#1a1c22'][k % 6]);
  }
  // main straight
  rect(g, 0, Y.straight, W, Y.curb - Y.straight, th.asphalt);
  for (let i = 0; i < 1600; i++) rect(g, rnd() * W | 0, Y.straight + rnd() * (Y.curb - Y.straight) | 0, 1, 1, shade(th.asphalt, rnd() < 0.5 ? -0.12 : 0.1));
  rect(g, 0, Y.straightMid - 3, W, 7, shade(th.asphalt, -0.1)); // rubbered racing line
  // start/finish line + grid boxes
  for (let y = Y.straight; y < Y.curb; y += 2) for (let x = 0; x < 4; x += 2) {
    rect(g, 300 + x + ((y / 2) % 2 ? 2 : 0), y, 2, 2, '#f0f0f0'); rect(g, 300 + x + ((y / 2) % 2 ? 0 : 2), y, 2, 2, '#101010');
  }
  for (let k = 0; k < 4; k++) { rect(g, 360 + k * 36, Y.straight + 3, 1, 7, '#e8e8e8'); rect(g, 360 + k * 36 - 6, Y.straight + 3, 6, 1, '#e8e8e8'); rect(g, 342 + k * 36, Y.curb - 10, 1, 7, '#e8e8e8'); rect(g, 342 + k * 36 - 6, Y.curb - 4, 6, 1, '#e8e8e8'); }
  // curbs
  for (let x = 0; x < W; x += 8) { rect(g, x, Y.curb, 4, 2, '#e8342c'); rect(g, x + 4, Y.curb, 4, 2, '#f0f0f0'); }
  rect(g, 0, Y.curb + 2, W, 2, th.grass);
  rect(g, 0, Y.straight - 1, W, 1, '#f0f0f0');
  rect(g, 0, Y.curb - 1, W, 1, '#f0f0f0');
  // pit wall: concrete with the gantries
  rect(g, 0, Y.wall, W, Y.lane - Y.wall, '#a8acb4');
  rect(g, 0, Y.wall, W, 1, '#d8dce4');
  rect(g, 0, Y.lane - 1, W, 1, '#6a6e78');
  for (let x = 0; x < W; x += 32) rect(g, x, Y.wall + 1, 1, 6, '#8a8e98');
  for (const [bx, team] of [[BOX_X, TEAMS[0]], ...RIVAL_BOXES.map(b => [b.x, TEAMS[b.team]])]) {
    rect(g, bx - 36, Y.wall + 1, 72, 6, '#2a2c34');
    rect(g, bx - 36, Y.wall + 1, 72, 1, team.c1);
    for (let k = 0; k < 5; k++) { rect(g, bx - 32 + k * 14, Y.wall + 2, 10, 3, '#1a3a6a'); rect(g, bx - 31 + k * 14, Y.wall + 3, 3, 1, '#4ad8a0'); rect(g, bx - 26 + k * 14, Y.wall + 3, 3, 1, '#d8d84a'); }
  }
  // pit lane (fast lane)
  rect(g, 0, Y.lane, W, Y.work - Y.lane, th.lane);
  for (let i = 0; i < 1200; i++) rect(g, rnd() * W | 0, Y.lane + rnd() * (Y.work - Y.lane) | 0, 1, 1, shade(th.lane, rnd() < 0.5 ? -0.1 : 0.08));
  for (let x = 0; x < W; x += 16) rect(g, x, Y.work - 1, 9, 1, '#f0f0f0');
  text(g, '80', 20, Y.laneMid - 3, shade(th.lane, 0.22), { scale: 1 });
  text(g, '80', 480, Y.laneMid - 3, shade(th.lane, 0.22), { scale: 1 });
  // work lane with painted boxes
  rect(g, 0, Y.work, W, Y.garage - Y.work, shade(th.lane, -0.06));
  for (let i = 0; i < 1400; i++) rect(g, rnd() * W | 0, Y.work + rnd() * (Y.garage - Y.work) | 0, 1, 1, shade(th.lane, rnd() < 0.5 ? -0.14 : 0.02));
  const boxes = [[BOX_X, TEAMS[0]], ...RIVAL_BOXES.map(b => [b.x, TEAMS[b.team]])];
  for (const [bx, team] of boxes) {
    const x0 = bx - 60, x1 = bx + 60, y0 = Y.work + 3, y1 = Y.garage - 3;
    g.fillStyle = team.c1;
    g.fillRect(x0, y0, 120, 2); g.fillRect(x0, y1 - 2, 120, 2); g.fillRect(x0, y0, 2, y1 - y0); g.fillRect(x1 - 2, y0, 2, y1 - y0);
    // wheel stop T marks
    rect(g, bx - 40, y0 + 5, 14, 1, '#f0f0f0'); rect(g, bx + 18, y0 + 5, 14, 1, '#f0f0f0');
    rect(g, bx - 40, y1 - 6, 14, 1, '#f0f0f0'); rect(g, bx + 18, y1 - 6, 14, 1, '#f0f0f0');
    rect(g, bx + 40, Y.box - 1, 6, 2, '#f0f0f0'); rect(g, bx + 42, Y.box - 7, 2, 14, '#f0f0f0');
    ditherRect(g, x0 + 4, y0 + 4, 112, y1 - y0 - 8, shade(team.c1, -0.55), 0.12);
  }
  // garages
  const gy = Y.garage;
  rect(g, 0, gy, W, Y.panel - gy, '#22242c');
  for (const [bx, team] of boxes) {
    const x0 = bx - 64;
    rect(g, x0, gy, 128, Y.panel - gy, '#d8dce2');
    rect(g, x0 + 2, gy + 2, 124, Y.panel - gy - 2, '#9aa0aa');
    for (let y = gy + 4; y < Y.panel; y += 6) rect(g, x0 + 2, y, 124, 1, '#8a909a');
    // back wall banner
    rect(g, x0 + 4, Y.panel - 12, 120, 10, team.c1);
    rect(g, x0 + 4, Y.panel - 12, 120, 2, team.c2);
    text(g, team.short, bx, Y.panel - 9, team.c3 === '#5c636e' ? '#1a1c22' : '#ffffff', { align: 'center' });
    // tyre stacks
    for (let s = 0; s < 3; s++) for (let k = 0; k < 3; k++) {
      const tx = x0 + 6 + s * 12, ty = gy + 6 + k * 7;
      rect(g, tx, ty, 10, 6, '#0a0a10'); rect(g, tx + 1, ty + 1, 8, 4, '#1c1c22');
      rect(g, tx + 2, ty + 1, 6, 1, ['#e8342c', '#f2c218', '#f4f4f0'][s]);
    }
    // tool chests
    rect(g, x0 + 92, gy + 6, 30, 18, '#0a0a10'); rect(g, x0 + 93, gy + 7, 28, 16, '#c8302a');
    for (let k = 0; k < 4; k++) rect(g, x0 + 94, gy + 9 + k * 4, 26, 1, '#7a1a16');
    // fuel rig
    rect(g, x0 + 56, gy + 4, 16, 20, '#0a0a10'); rect(g, x0 + 57, gy + 5, 14, 18, '#d8a020'); rect(g, x0 + 59, gy + 8, 10, 3, '#222');
    // side walls between garages
    rect(g, x0 - 1, gy, 2, Y.panel - gy, '#4a4e58'); rect(g, x0 + 127, gy, 2, Y.panel - gy, '#4a4e58');
  }
  // garage door line
  rect(g, 0, gy, W, 2, '#3a3e48');
  rect(g, 0, gy + 2, W, 1, '#6a6e78');
  // overall light tint
  if (th.tint) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = th.tint[1] * (th.night ? 1.2 : 1);
    rect(g, 0, 0, W, Y.panel, th.tint[0]);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  if (th.night) {
    // floodlights: dithered pools of light on the work lane and straight
    for (const lx of [BOX_X, 96, 416]) for (let k = 0; k < 4; k++) {
      g.globalAlpha = 0.07;
      ellipse(g, lx, Y.box - 4, 90 - k * 18, 40 - k * 8, '#fff6d8');
    }
    for (let x = 32; x < W; x += 96) { g.globalAlpha = 0.06; ellipse(g, x, Y.straightMid, 60, 14, '#fff6d8'); }
    g.globalAlpha = 1;
    // neon strip on the pit wall
    rect(g, 0, Y.wall + 7, W, 1, '#ff3aa8');
  }
  return c;
}

// Car on the main straight (smaller scale = further away), with motion streaks.
export function straightCar(g, sprite, x, y, speed) {
  const w = 54, h = 21;
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 1; k <= 3; k++) g.fillRect(Math.round(x - k * 10 - 6), Math.round(y - 5 + k * 2), 10, 1);
  g.drawImage(sprite, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

// Track map as a closed Catmull-Rom loop; returns sampler p(t) for t in [0,1).
export function trackPath(points, samples = 240) {
  const n = points.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let k = 0; k < 20; k++) {
      const t = k / 20, t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  // arc-length table
  const L = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let s = 0; s < samples; s++) {
    const d = s / samples * total;
    while (L[j + 1] < d) j++;
    const f = (d - L[j]) / (L[j + 1] - L[j] || 1), a = pts[j], b = pts[(j + 1) % pts.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return t => out[Math.floor(((t % 1) + 1) % 1 * samples) % samples];
}

export function bakeMap(track, w, h) {
  const [c, g] = canvas(w, h);
  const P = trackPath(track.map);
  const pts = [];
  for (let i = 0; i < 240; i++) pts.push(P(i / 240));
  const map = ([x, y]) => [4 + x * (w - 8), 4 + y * (h - 8)];
  for (const [col, r] of [['#05060a', 2.5], ['#6a7090', 1.5], ['#c8cce0', 0.6]]) {
    for (const p of pts) { const [x, y] = map(p); ellipse(g, x, y, r, r, col); }
  }
  // start line marker
  const [sx, sy] = map(P(0));
  rect(g, sx - 1, sy - 3, 2, 6, '#ffffff');
  return { c, P, map };
}
