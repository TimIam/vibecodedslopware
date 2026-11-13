// Everything on screen. It reads a game (the host's live one, or a guest's copy of it) and draws it on
// a 480x270 canvas that the page scales up in whole pixels.
import { RINK } from './sim.js';
import { text, measure } from './font.js';
import { PLAYER_COLORS } from './teams.js';

const { W, H, GL, GR, GY0, GY1, NET, CORNER, MID } = RINK;
export const SW = 480, SH = 270;
export const ICE_Y = 46;
export const camX = () => cam;
const SKIN = ['#f1c9a5', '#d9a273', '#a86f47', '#f6d7bd', '#c68c5e', '#8a5a3a'];

let g = null, rink = null, cam = 240, camInit = false;
export function init(canvas) { g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; rink = buildRink(); }
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

// How far the boards cut in at the rounded corners, for a row (or by symmetry a column) of the ice.
function inset(v, len) {
  const d = v < CORNER ? CORNER - v : v > len - CORNER ? v - (len - CORNER) : 0;
  return d ? Math.round(CORNER - Math.sqrt(CORNER * CORNER - d * d)) : 0;
}
function ring(c, cx, cy, r, color) {
  c.fillStyle = color;
  for (let a = 0; a < 360; a += 1.5) c.fillRect(Math.round(cx + Math.cos(a * Math.PI / 180) * r), Math.round(cy + Math.sin(a * Math.PI / 180) * r), 1, 1);
}
function buildRink() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = SH;
  const c = cv.getContext('2d');
  let seed = 7; const rr = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  c.fillStyle = '#0b1020'; c.fillRect(0, 0, W, SH);
  // the stands
  const shirts = ['#c0392b', '#2e86c1', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#d35400', '#16a085'];
  for (let row = 0; row < 5; row++) for (let x = (row % 2) * 2; x < W; x += 4) {
    const y = 16 + row * 4 + (rr() < 0.3 ? 1 : 0);
    c.fillStyle = shirts[(rr() * shirts.length) | 0]; c.fillRect(x, y + 2, 3, 3);
    c.fillStyle = SKIN[(rr() * SKIN.length) | 0]; c.fillRect(x + 1, y, 2, 2);
  }
  c.fillStyle = 'rgba(11,16,32,.35)'; c.fillRect(0, 16, W, 22);
  // far boards, ice, near boards, one column or row at a time so the corners come out as clean pixels
  for (let x = 0; x < W; x++) {
    const iy = inset(x, W);
    c.fillStyle = 'rgba(190,225,255,.16)'; c.fillRect(x, ICE_Y + iy - 16, 1, 8);       // glass
    c.fillStyle = '#eef2f6'; c.fillRect(x, ICE_Y + iy - 8, 1, 8);
    c.fillStyle = '#2a3550'; c.fillRect(x, ICE_Y + iy - 9, 1, 1);
    c.fillStyle = '#f2c230'; c.fillRect(x, ICE_Y + iy - 1, 1, 1);
  }
  for (let y = 0; y < H; y++) {
    const ix = inset(y, H);
    c.fillStyle = '#e9f2f8'; c.fillRect(ix, ICE_Y + y, W - ix * 2, 1);
    c.fillStyle = '#c9d3de'; c.fillRect(ix - 3, ICE_Y + y, 3, 1); c.fillRect(W - ix, ICE_Y + y, 3, 1);
    c.fillStyle = '#f2c230'; c.fillRect(ix, ICE_Y + y, 1, 1); c.fillRect(W - ix - 1, ICE_Y + y, 1, 1);
  }
  for (let x = 0; x < W; x++) {
    const iy = inset(x, W);
    c.fillStyle = '#2a3550'; c.fillRect(x, ICE_Y + H - iy, 1, 1);
    c.fillStyle = '#aab6c4'; c.fillRect(x, ICE_Y + H - iy + 1, 1, SH - (ICE_Y + H - iy + 1));
  }
  // skate marks
  for (let i = 0; i < 520; i++) { const x = 20 + rr() * (W - 40), y = 6 + rr() * (H - 12); c.fillStyle = rr() < 0.5 ? '#dfeaf2' : '#f4f9fc'; c.fillRect(x | 0, ICE_Y + (y | 0), 2 + ((rr() * 7) | 0), 1); }
  // lines and circles
  const line = (x, w, col) => { c.fillStyle = col; c.fillRect(x, ICE_Y + 1, w, H - 2); };
  line(W / 2 - 1, 3, '#d64545'); line(330, 3, '#3d6fd6'); line(627, 3, '#3d6fd6');
  for (const gx of [GL, GR]) { c.fillStyle = '#d64545'; c.fillRect(gx, ICE_Y + 9, 1, H - 18); }
  ring(c, W / 2, ICE_Y + MID, 30, '#3d6fd6'); c.fillStyle = '#3d6fd6'; c.fillRect(W / 2 - 2, ICE_Y + MID - 2, 5, 5);
  for (const fx of [190, W - 190]) for (const fy of [52, H - 52]) { ring(c, fx, ICE_Y + fy, 24, '#d64545'); c.fillStyle = '#d64545'; c.fillRect(fx - 1, ICE_Y + fy - 1, 3, 3); }
  for (const side of [0, 1]) {
    const gx = side ? GR : GL, s = side ? -1 : 1;
    for (let y = -18; y <= 18; y++) { const w = Math.round(Math.sqrt(18 * 18 - y * y)); c.fillStyle = '#bfe0f5'; c.fillRect(s > 0 ? gx + 1 : gx - w, ICE_Y + MID + y, w, 1); }
    c.fillStyle = '#d64545';
    for (let a = -90; a <= 90; a += 2) c.fillRect(Math.round(gx + s * Math.cos(a * Math.PI / 180) * 18), Math.round(ICE_Y + MID + Math.sin(a * Math.PI / 180) * 18), 1, 1);
  }
  // board adverts
  const ads = ['VIBE CODED SLOPWARE', 'ZAMBONI RENTALS', 'EAT MORE ICE', 'DR. TOOTH DDS', 'BIG AL\'S USED PUCKS', 'HOT SOUP', 'MOM SAYS HI', 'ACME SHIN PADS'];
  const cols = ['#c0392b', '#2456b8', '#1e8449', '#6c3483'];
  let ax = 70, k = 0;
  while (ax < W - 150) { const s = ads[k % ads.length]; text(c, s, ax, ICE_Y - 7, cols[k % cols.length]); ax += measure(s) + 34; k++; }
  return cv;
}

// ------------------------------------------------------------------------------------------ sprites
function skater(x, y, s, C, t, mine) {
  const f = s.face, moving = Math.hypot(s.vx, s.vy) > 22, fr = moving ? ((t * 9 + s.id * 0.37) | 0) & 1 : 0;
  x = Math.round(x); y = Math.round(y);
  R(x - 5, y, 10, 2, 'rgba(30,50,90,.22)'); R(x - 3, y + 2, 6, 1, 'rgba(30,50,90,.22)');
  if (mine) {      // a green ring on the ice under the skater you control
    for (let a = 0; a < 360; a += 6) { const px = Math.round(x + Math.cos(a * Math.PI / 180) * 10), py = Math.round(y - 2 + Math.sin(a * Math.PI / 180) * 4.5); R(px, py + 1, 1, 1, '#0c5a1e'); R(px, py, 1, 1, '#35e04f'); }
  }
  const skin = SKIN[s.id % SKIN.length];
  if (s.down > 0) {
    R(x - 7 * f, y - 4, 1, 1, '#7a5230');
    R(x - 6, y - 4, 12, 4, C.j); R(x - 6, y - 2, 12, 1, C.t);
    R(f > 0 ? x - 10 : x + 6, y - 4, 4, 3, C.p);
    R(f > 0 ? x + 6 : x - 9, y - 5, 3, 3, skin); R(f > 0 ? x + 7 : x - 10, y - 6, 3, 2, C.h);
    return;
  }
  if (s.role === 5) {
    R(x - 4, y - 7, 9, 7, '#f6f6f2'); R(x - 4, y - 4, 9, 1, C.t); R(x, y - 7, 1, 7, '#cfcfca');
    R(x - 4, y - 14, 9, 7, C.j); R(x - 4, y - 10, 9, 1, C.t);
    R(x - 2, y - 18, 5, 4, '#f6f6f2'); R(x - 1 + (f > 0 ? 1 : 0), y - 16, 3, 1, '#333');
    R(f > 0 ? x + 5 : x - 7, y - 13, 3, 4, '#8b5a2b'); R(f > 0 ? x - 7 : x + 5, y - 12, 3, 5, C.t);
    R(f > 0 ? x + 6 : x - 7, y - 8, 2, 8, '#d8c9a8'); R(f > 0 ? x + 6 : x - 10, y - 1, 5, 1, '#d8c9a8');
    return;
  }
  const lean = s.lunge > 0 ? f * 2 : 0;
  // skates and legs
  R(x - 4 - fr, y - 1, 3, 1, '#20242e'); R(x + 1 + fr, y - 1, 3, 1, '#20242e');
  R(x - 3 - fr, y - 3, 2, 2, C.t); R(x + 1 + fr, y - 3, 2, 2, C.t);
  R(x - 3, y - 7, 6, 4, C.p);
  // body, arms, head
  R(x - 3 + lean, y - 13, 7, 6, C.j); R(x - 3 + lean, y - 9, 7, 1, C.t);
  R(x - 2 + lean, y - 16, 4, 3, skin); R(x - 2 + lean, y - 18, 4, 2, C.h); R(x + (f > 0 ? 1 : -2) + lean, y - 16, 1, 1, '#222');
  const wind = s.wind >= 0, hx = x + lean + (f > 0 ? 3 : -5);
  R(hx, y - 11, 2, 3, C.j); R(hx + (f > 0 ? 1 : -1), y - 9, 2, 2, '#2b2b2b');
  // stick
  if (wind) { const lift = Math.min(4, 1 + Math.floor(s.wind * 8)); for (let i = 0; i < lift; i++) R(x - f * (2 + i) + lean, y - 11 - i * 2, 1, 2, '#7a5230'); R(x - f * (2 + lift) + lean - (f > 0 ? 1 : 0), y - 11 - lift * 2, 2, 1, '#20242e'); }
  else if (s.shotAnim > 0) { for (let i = 0; i < 5; i++) R(x + f * (4 + i) + lean, y - 9 - i, 1, 2, '#7a5230'); }
  else { for (let i = 0; i < 4; i++) R(x + f * (5 + i) + lean, y - 8 + i * 2, 1, 2, '#7a5230'); R(f > 0 ? x + 9 + lean : x - 11 + lean, y - 1, 3, 1, '#20242e'); }
}
// The referee: on the ice, in stripes, on nobody's side. Purely for show, so each screen moves its own.
// At a faceoff he stands over the dot with the puck and drops it; in play he keeps along the boards.
const ref = { x: W / 2, y: MID - 13, face: 1, side: 0, on: false };
function refStep(V, dt) {
  const p = V.puck, center = V.phase !== 'play' && V.phase !== 'draw';
  if (p.y < 44) ref.side = 1; else if (p.y > H - 44) ref.side = 0;
  const tx = center ? W / 2 : Math.max(60, Math.min(W - 60, p.x + (p.x < W / 2 ? 55 : -55)));
  const ty = center ? MID - 13 : ref.side ? H - 13 : 15;
  const dx = tx - ref.x, dy = ty - ref.y, d = Math.hypot(dx, dy), sp = (center ? 210 : 125) * dt;
  if (!ref.on || d > 520) { ref.x = tx; ref.y = ty; ref.on = true; ref.mv = false; return; }
  ref.mv = d > 2;
  if (d <= sp) { ref.x = tx; ref.y = ty; } else { ref.x += dx / d * sp; ref.y += dy / d * sp; if (Math.abs(dx) > 3) ref.face = dx > 0 ? 1 : -1; }
}
function referee(V, t) {
  const x = Math.round(ref.x - cam), y = Math.round(ICE_Y + ref.y), fr = ref.mv ? ((t * 9) | 0) & 1 : 0, f = ref.face;
  const hold = V.phase === 'faceoff' && Math.abs(ref.x - W / 2) < 3 && Math.abs(ref.y - (MID - 13)) < 3;
  R(x - 5, y, 10, 2, 'rgba(30,50,90,.22)'); R(x - 3, y + 2, 6, 1, 'rgba(30,50,90,.22)');
  R(x - 4 - fr, y - 1, 3, 1, '#20242e'); R(x + 1 + fr, y - 1, 3, 1, '#20242e');
  R(x - 3, y - 7, 6, 6, '#15171d');
  for (let i = 0; i < 7; i++) R(x - 3 + i, y - 13, 1, 6, i % 2 ? '#15171d' : '#f4f4f0');
  R(x - 2, y - 16, 4, 3, '#e3b58f'); R(x - 2, y - 18, 4, 2, '#15171d'); R(x + (f > 0 ? 1 : -2), y - 16, 1, 1, '#222');
  if (hold) { R(x - 1, y - 11, 2, 5, '#f4f4f0'); R(x - 1, y - 12, 2, 1, '#ff8a1e'); R(x - 1, y - 6, 2, 2, '#e3b58f'); }
  else { R(x + (f > 0 ? 3 : -5), y - 12, 2, 4, '#f4f4f0'); R(x + (f > 0 ? 3 : -5), y - 12, 2, 1, '#ff8a1e'); }
}
function cursor(ui) {
  if (!ui.cur) return;
  const x = Math.round(ui.cur[0]), y = Math.round(ui.cur[1]);
  for (const [c, o] of [['#0b0f1a', 1], ['#ffffff', 0]]) {
    R(x - 6 - o, y - o, 4 + o * 2, 1 + o * 2, c); R(x + 3 - o, y - o, 4 + o * 2, 1 + o * 2, c);
    R(x - o, y - 6 - o, 1 + o * 2, 4 + o * 2, c); R(x - o, y + 3 - o, 1 + o * 2, 4 + o * 2, c);
  }
  R(x, y, 1, 1, '#35e04f');
}
function net(side) {
  const x0 = (side ? GR : GL - NET) - cam, y0 = ICE_Y + GY0, h = GY1 - GY0;
  R(x0, y0 - 5, NET, h + 5, 'rgba(255,255,255,.5)');
  g.fillStyle = 'rgba(120,140,160,.5)';
  for (let i = 1; i < NET; i += 3) g.fillRect(Math.round(x0 + i), y0 - 5, 1, h + 5);
  for (let j = -3; j < h; j += 3) g.fillRect(Math.round(x0), y0 + j, NET, 1);
  const back = side ? x0 + NET - 1 : x0;
  R(back, y0 - 6, 2, h + 7, '#c0392b'); R(x0, y0 - 6, NET, 2, '#c0392b'); R(x0, y0 + h - 1, NET, 2, '#c0392b');
  const post = side ? x0 - 1 : x0 + NET - 1;
  R(post, y0 - 6, 2, 7, '#e74c3c'); R(post, y0 + h - 6, 2, 7, '#e74c3c');
}
function puck(p) {
  const x = Math.round(p.x - cam), y = Math.round(ICE_Y + p.y), sp = Math.hypot(p.vx, p.vy);
  if (p.owner < 0 && sp > 240) { const n = Math.hypot(p.vx, p.vy); for (let i = 1; i <= 3; i++) R(x - p.vx / n * i * 4, y - 1 - p.vy / n * i * 4, 2, 1, `rgba(20,20,30,${0.3 - i * 0.08})`); }
  R(x - 1, y + 1, 4, 1, 'rgba(30,50,90,.3)'); R(x - 1, y - 1, 3, 2, '#12141a');
}

// --------------------------------------------------------------------------------------------- hud
const clockStr = (secs, periodLen) => { const s = Math.max(0, Math.ceil(secs * 1200 / periodLen)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const periodName = p => (p > 3 ? (p > 4 ? (p - 3) + 'OT' : 'OT') : ['1ST', '2ND', '3RD'][p - 1]);
function hud(V, ui) {
  const K = ui.kits;
  R(0, 0, SW, 16, '#0b0f1a'); R(0, 16, SW, 1, '#232b40');
  for (const team of [0, 1]) {
    const L = team === 0, C = K[team];
    R(L ? 3 : SW - 6, 2, 3, 12, C.j); R(L ? 3 : SW - 6, 9, 3, 2, C.t);
    text(g, C.abbr, L ? 10 : SW - 10, 5, '#e8ecf4', { align: L ? 'left' : 'right' });
    text(g, String(V.score[team]), L ? 40 : SW - 40, 1, '#ffffff', { scale: 2, align: L ? 'left' : 'right' });
    text(g, 'SOG ' + V.shots[team], L ? 62 : SW - 62, 5, '#7f8aa3', { align: L ? 'left' : 'right' });
    const pen = Math.max(0, ...V.sk.filter(s => s.team === team).map(s => s.out));
    if (pen > 0) text(g, 'PENALTY ' + clockStr(pen, V.cfg.periodLen), L ? 104 : SW - 104, 5, '#ff6b5e', { align: L ? 'left' : 'right' });
  }
  text(g, periodName(V.period), SW / 2 - 24, 5, '#f2c230', { align: 'right' });
  text(g, clockStr(V.clock, V.cfg.periodLen), SW / 2 + 2, 1, V.clock < 10 && V.phase === 'play' && ((ui.t * 4) | 0) % 2 ? '#ff6b5e' : '#ffffff', { scale: 2, align: 'center' });
}
function banner(ui) {
  const b = ui.banner;
  if (!b || b.t <= 0) return;
  const flash = b.flash ? [b.color, '#ffffff', '#ffe14d'][((ui.t * 10) | 0) % 3] : b.color;
  const s = b.scale || 3, y = b.y ?? 96;
  const w = measure(b.text, s);
  R(SW / 2 - w / 2 - 10, y - 5, w + 20, 7 * s + 10, 'rgba(8,12,24,.72)');
  text(g, b.text, SW / 2, y, flash, { scale: s, align: 'center', shadow: '#000' });
  if (b.sub) { const w2 = measure(b.sub); R(SW / 2 - w2 / 2 - 6, y + 7 * s + 7, w2 + 12, 13, 'rgba(8,12,24,.72)'); text(g, b.sub, SW / 2, y + 7 * s + 10, '#e8ecf4', { align: 'center' }); }
}

// -------------------------------------------------------------------------------------------- rink
export function draw(V, ui) {
  const p = V.puck;
  const target = Math.max(0, Math.min(W - SW, p.x + Math.max(-40, Math.min(40, p.vx * 0.2)) - SW / 2));
  if (!camInit || Math.abs(target - cam) > 400) { cam = target; camInit = true; } else cam += (target - cam) * Math.min(1, ui.dt * 5);
  const shake = ui.shake > 0 ? Math.round((Math.random() - 0.5) * ui.shake * 6) : 0;
  const cx = Math.round(cam);
  g.save(); g.translate(0, shake);
  g.drawImage(rink, cx, 0, SW, SH, 0, 0, SW, SH);
  if (ui.cheer > 0) {      // the crowd jumps
    const up = ((ui.t * 8) | 0) % 2;
    g.drawImage(rink, cx, 16, SW, 21, 0, 16 - up, SW, 21);
    for (let i = 0; i < 14; i++) R((i * 97 + ((ui.t * 20) | 0) * 31) % SW, 18 + (i * 7) % 16, 1, 1, '#ffffff');
  }
  const savedCam = cam; cam = cx;
  net(0); net(1);
  refStep(V, ui.dt);
  const held = V.phase === 'faceoff';      // the puck is in the referee's hand until it drops
  const list = V.sk.filter(s => s.out <= 0).concat({ isRef: true, y: ref.y }).sort((a, b) => a.y - b.y);
  let puckDrawn = p.owner >= 0 || held;
  for (const s of list) {
    if (s.isRef) { referee(V, ui.t); continue; }
    if (!puckDrawn && p.y < s.y) { puck(p); puckDrawn = true; }
    const c = s.ctl >= 0 ? s.ctl : -1;
    skater(s.x - cam, ICE_Y + s.y, s, ui.kits[s.team], ui.t, c >= 0 && c === ui.me ? PLAYER_COLORS[c % 4] : null);
    if (p.owner === s.id) puck(p);
    if (s.id === ui.hover) { const x = Math.round(s.x - cam), y = Math.round(ICE_Y + s.y); for (const sx of [-1, 1]) for (const sy of [0, 1]) { R(x + sx * 8 - (sx > 0 ? 3 : 0), sy ? y + 3 : y - 21, 4, 1, '#ffffff'); R(x + sx * 8 - (sx > 0 ? 0 : 0) + (sx > 0 ? 0 : 0), sy ? y : y - 21, 1, 4, '#ffffff'); } }
    if (c >= 0) {
      const col = PLAYER_COLORS[c % 4], x = Math.round(s.x - cam), y = Math.round(ICE_Y + s.y) - 26 + (c === ui.me ? ((ui.t * 4) | 0) % 2 : 0);
      R(x - 2, y, 5, 1, col); R(x - 1, y + 1, 3, 1, col); R(x, y + 2, 1, 1, col);
      if (c !== ui.me && ui.names[c]) text(g, ui.names[c].slice(0, 6), x, y - 9, col, { align: 'center', outline: '#0b0f1a' });
    }
  }
  if (!puckDrawn) puck(p);
  if (held) {
    const k = Math.max(0, Math.min(1, 1 - V.phaseT / 0.28)), hy = ref.y - 5 + (MID - (ref.y - 5)) * k * k, hx = ref.x + (W / 2 - ref.x) * k;
    if (k > 0) R(Math.round(W / 2 - cam) - 1, ICE_Y + MID + 1, 4, 1, 'rgba(30,50,90,.3)');
    R(Math.round(hx - cam) - 1, Math.round(ICE_Y + hy) - 1, 3, 2, '#12141a');
  }
  // where the shot will go: a marker sliding up and down the goal mouth
  for (const team of [0, 1]) {
    const a = V.aim[team];
    if (!a.on || V.phase !== 'play') continue;
    const gx = (team === 0 ? GR : GL) - cam, y = Math.round(ICE_Y + a.y), d = team === 0 ? 1 : -1, col = ((ui.t * 12) | 0) % 2 ? '#ffe14d' : '#ff5a36';
    for (let i = 0; i < 5; i++) { R(gx - d * (14 - i * 2) - (d > 0 ? 1 : 0), y - (4 - i) - 1, 2, (4 - i) * 2 + 1, '#0b0f1a'); }
    for (let i = 0; i < 4; i++) { R(gx - d * (12 - i * 2) - (d > 0 ? 1 : 0), y - (3 - i), 2, (3 - i) * 2 + 1, col); }
    R(gx + d * 3 - 2, y - 2, 5, 5, '#0b0f1a'); R(gx + d * 3 - 1, y - 1, 3, 3, col);
  }
  // an arrow at the screen edge when your skater is out of view
  const mine = V.sk.find(s => s.ctl === ui.me && ui.me >= 0 && s.out <= 0);
  if (mine) { const sx = mine.x - cam, col = PLAYER_COLORS[ui.me % 4], y = ICE_Y + mine.y - 8; if (sx < -4) { R(2, y - 2, 2, 5, col); R(4, y - 1, 1, 3, col); R(1, y, 1, 1, col); } else if (sx > SW + 4) { R(SW - 4, y - 2, 2, 5, col); R(SW - 5, y - 1, 1, 3, col); R(SW - 2, y, 1, 1, col); } }
  cam = savedCam;
  g.restore();
  hud(V, ui);
  banner(ui);
  if (ui.hint) { const w = measure(ui.hint); R(SW / 2 - w / 2 - 5, SH - 13, w + 10, 11, 'rgba(8,12,24,.7)'); text(g, ui.hint, SW / 2, SH - 11, '#cfd6e6', { align: 'center' }); }
  if (ui.dim) R(0, 0, SW, SH, `rgba(6,9,18,${ui.dim})`);
  cursor(ui);
}

// ------------------------------------------------------------------------------------------- fights
function fighter(x, y, facing, C, f, id, t) {
  const skin = SKIN[id % SKIN.length], S = 5;
  g.save(); g.translate(Math.round(x), y); g.scale(S * facing, S);
  const q = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  q(-6, 0, 12, 1, 'rgba(30,50,90,.25)');
  if (f.st === 4) {       // out cold
    q(-12, -4, 14, 4, C.j); q(-12, -2, 14, 1, C.t); q(2, -4, 5, 3, C.p); q(7, -3, 3, 2, '#20242e'); q(-16, -5, 4, 4, skin); q(-16, -6, 4, 1, '#3a2a1c');
    g.restore();
    for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; text(g, '*', x - facing * 70 + Math.cos(a) * 14, y - 44 + Math.sin(a) * 5, '#ffe14d', { scale: 2, align: 'center' }); }
    return;
  }
  const hurt = f.st === 3, bob = hurt ? 0 : (((t * 5 + id) | 0) % 2);
  if (hurt) g.translate(-2, 0);
  q(-4, -1, 3, 1, '#20242e'); q(1, -1, 4, 1, '#20242e');
  q(-3, -3, 2, 2, C.t); q(1, -3, 2, 2, C.t);
  q(-3, -8, 6, 5, C.p);
  q(-3, -15 + bob, 7, 7, hurt && ((t * 30) | 0) % 2 ? '#ffffff' : C.j); q(-3, -11 + bob, 7, 1, C.t);
  const hb = hurt ? -1 : 0;
  q(-2 + hb, -19 + bob, 4, 4, skin); q(-2 + hb, -20 + bob, 4, 1, '#3a2a1c'); q(1 + hb, -18 + bob, 1, 1, '#1a1a1a');
  if (hurt) q(2 + hb, -17 + bob, 1, 1, '#c0392b');
  // fists: [lead x, lead y, rear x, rear y]
  let fx = 4, fy = -15, rx = 2, ry = -13;
  if (f.st === 1 || f.st === 2) {
    const hi = f.st === 1, at = hi ? 0.16 : 0.1, tot = hi ? 0.42 : 0.3, e = f.t < at ? f.t / at : Math.max(0, 1 - (f.t - at) / (tot - at));
    fx = 4 + Math.round(e * 7); fy = hi ? -18 : -11;
  } else if (f.g === 1) { fx = 3; fy = -20; rx = 2; ry = -17; } else if (f.g === 2) { fx = 4; fy = -12; rx = 3; ry = -9; } else if (hurt) { fx = 1; fy = -12; rx = -1; ry = -11; }
  fy += bob; ry += bob;
  q(1, ry + 1, Math.max(1, rx - 1), 2, C.j); q(rx, ry, 2, 2, skin);
  q(2, Math.min(fy, -14 + bob), 1, Math.abs(fy + 14 - bob) + 2, C.j); q(2, fy, Math.max(1, fx - 2), 2, C.j); q(fx, fy - 1, 3, 3, skin);
  g.restore();
}
export function drawFight(V, ui) {
  const F = V.fight, K = ui.kits, t = ui.t;
  R(0, 0, SW, SH, '#080b16');
  const shirts = ['#c0392b', '#2e86c1', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22'];
  for (let row = 0; row < 6; row++) for (let i = 0; i < 44; i++) {
    const x = i * 11 + (row % 2) * 5, y = 44 + row * 13, up = ((t * 6 + i * 3 + row) | 0) % 5 === 0 ? 2 : 0;
    R(x, y + 5 - up, 8, 8, shirts[(i * 7 + row * 3) % shirts.length]); R(x + 2, y - up, 5, 5, SKIN[(i + row * 5) % SKIN.length]);
  }
  R(0, 40, SW, 86, 'rgba(8,11,22,.55)');
  R(0, 126, SW, 6, 'rgba(190,225,255,.2)'); R(0, 132, SW, 22, '#eef2f6'); R(0, 152, SW, 2, '#f2c230'); R(0, 131, SW, 1, '#2a3550');
  text(g, 'TWO MINUTES FOR LOOKING AT ME FUNNY', 8, 139, '#2456b8'); text(g, 'NO REFUNDS ON TEETH', SW - 8, 139, '#c0392b', { align: 'right' });
  R(0, 154, SW, SH - 154, '#e9f2f8'); R(0, 250, SW, 3, '#d64545');
  for (let i = 0; i < 30; i++) R((i * 53) % SW, 160 + (i * 29) % 90, 6 + (i % 5), 1, '#dfeaf2');
  const shake = ui.shake > 0 ? Math.round((Math.random() - 0.5) * ui.shake * 8) : 0;
  g.save(); g.translate(shake, 0);
  for (const i of [0, 1]) fighter(SW / 2 + F.f[i].x * 3.4, 238, i === 0 ? 1 : -1, K[i], F.f[i], F.ids[i], t);
  g.restore();
  // health
  R(0, 0, SW, 34, '#0b0f1a'); R(0, 34, SW, 1, '#232b40');
  for (const i of [0, 1]) {
    const L = i === 0, f = F.f[i];
    text(g, K[i].name, L ? 12 : SW - 12, 4, '#e8ecf4', { align: L ? 'left' : 'right' });
    for (let k = 0; k < 10; k++) { const on = k < f.hp, x = L ? 12 + k * 17 : SW - 12 - (k + 1) * 17 + 2; R(x, 15, 15, 10, on ? (f.hp <= 3 ? '#ff5a36' : K[i].j) : '#1b2233'); if (on) R(x, 15, 15, 2, 'rgba(255,255,255,.35)'); }
  }
  text(g, String(Math.max(0, Math.ceil(22 - F.t))), SW / 2, 10, '#f2c230', { scale: 2, align: 'center' });
  if (F.intro > 0) text(g, 'GLOVES OFF!', SW / 2, 66, ((t * 10) | 0) % 2 ? '#ffe14d' : '#ff5a36', { scale: 4, align: 'center', shadow: '#000' });
  else if (F.over > 0) {
    text(g, F.winner < 0 ? 'A DRAW' : K[F.winner].name + ' WIN IT', SW / 2, 62, '#ffe14d', { scale: 3, align: 'center', shadow: '#000' });
    text(g, F.winner < 0 ? 'NOBODY SITS' : K[1 - F.winner].name + ' SIT FIVE FOR FIGHTING', SW / 2, 90, '#ffffff', { align: 'center', outline: '#000' });
  }
  if (ui.hint) { const w = measure(ui.hint); R(SW / 2 - w / 2 - 5, SH - 13, w + 10, 11, 'rgba(8,12,24,.75)'); text(g, ui.hint, SW / 2, SH - 11, '#cfd6e6', { align: 'center' }); }
  if (ui.dim) R(0, 0, SW, SH, `rgba(6,9,18,${ui.dim})`);
  cursor(ui);
}

// The big name over the attract game on the title screen.
export function drawLogo(t) {
  const y = 34 + Math.round(Math.sin(t * 2) * 2);
  text(g, 'PUCK AROUND', SW / 2, y, '#ffe14d', { scale: 5, align: 'center', shadow: '#b3261e' });
  text(g, '& FIND OUT', SW / 2, y + 42, '#ffffff', { scale: 3, align: 'center', shadow: '#1f3fa8' });
}
export function drawPanel(lines, y0 = 150) {
  let w = 0; for (const l of lines) w = Math.max(w, measure(l.text, l.scale || 1));
  const h = lines.reduce((a, l) => a + 7 * (l.scale || 1) + 6, 0) + 8;
  R(SW / 2 - w / 2 - 12, y0, w + 24, h, 'rgba(8,12,24,.86)'); R(SW / 2 - w / 2 - 12, y0, w + 24, 1, '#f2c230');
  let y = y0 + 7;
  for (const l of lines) { text(g, l.text, SW / 2, y, l.color || '#ffffff', { scale: l.scale || 1, align: 'center' }); y += 7 * (l.scale || 1) + 6; }
}
