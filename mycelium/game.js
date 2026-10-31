// Mycelium: rendering, input, sound, garden map, save. The simulation itself is in sim.js.
import { Sim, W, H, AIR, SOIL, CLAY, ROCK, WATER, FOOD, LROOT, TPS, DAY, PLOT_KINDS, COSTS, mulberry } from './sim.js';

const S = 3;                       // canvas pixels per cell
const PW = W * S, PH = H * S;      // 480 x 288
const SAVE_KEY = 'mycelium-garden-v1';

// ---------- garden ----------
const GARDEN = [
  ['tree', 'lawn', 'bed', 'compost'],
  ['lawn', 'patio', 'patio', 'pond'],
  ['lawn', 'path', 'bed', 'lawn'],
];
const COLS = 4, ROWS = 3, START = 8; // bottom-left
const plotKind = i => GARDEN[Math.floor(i / COLS)][i % COLS];
const neighbors = i => {
  const x = i % COLS, y = Math.floor(i / COLS), out = [];
  if (x > 0) out.push(i - 1); if (x < COLS - 1) out.push(i + 1);
  if (y > 0) out.push(i - COLS); if (y < ROWS - 1) out.push(i + COLS);
  return out;
};
function distances() {
  const d = new Array(COLS * ROWS).fill(99); d[START] = 0; const q = [START];
  while (q.length) { const i = q.shift(); for (const n of neighbors(i)) if (plotKind(n) !== 'patio' && d[n] === 99) { d[n] = d[i] + 1; q.push(n); } }
  return d;
}
const DIST = distances();
const sporeCost = i => 30 + 15 * DIST[i];

let garden = loadGarden();
function loadGarden() {
  try { const g = JSON.parse(localStorage.getItem(SAVE_KEY)); if (g && g.held) return g; } catch { }
  return null;
}
function newGarden() {
  garden = { seed: (Math.random() * 1e9) >>> 0, held: new Array(COLS * ROWS).fill(false), bank: 0, won: false, plays: 0 };
  saveGarden();
}
function saveGarden() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(garden)); } catch { } }

// ---------- DOM ----------
const $ = s => document.querySelector(s);
const cv = $('#world'), ctx = cv.getContext('2d', { alpha: false });
cv.width = PW; cv.height = PH;
const img = ctx.createImageData(PW, PH);
const px = new Uint32Array(img.data.buffer);
const stage = $('#stage');
const tri = $('#tri'), tctx = tri.getContext('2d');
const el = {
  energy: $('#energy'), energyBar: $('#energyBar'), net: $('#net'), tips: $('#tipsN'), water: $('#water'), waterBar: $('#waterBar'),
  spores: $('#spores'), sporeBar: $('#sporeBar'), bank: $('#bank'), rival: $('#rival'), rivalBar: $('#rivalBar'), grubs: $('#grubs'),
  day: $('#day'), weather: $('#weather'), plotName: $('#plotName'), log: $('#log'), pct: $('#pct'),
  pause: $('#pause'), speed: [...document.querySelectorAll('[data-speed]')], shroomsN: $('#shroomsN'), coreHp: $('#coreHp'),
  tools: $('#tools'), goals: $('#goals'), toast: $('#toast'), mute: $('#mute'),
};

const TOOLS = [
  { id: 'attract', key: 'A', label: '◌ attract', title: 'Drag in the soil to lay attractant. Tips steer toward it. Click a grub or slug to poison it.' },
  { id: 'lead', key: 'S', label: '➤ lead', title: 'Hold and drag: a tip you steer by hand grows from your nearest hyphae toward the pointer. Strong in a fight.' },
  { id: 'surge', key: 'D', label: '✦ surge', cost: COSTS.surge, title: 'Click near your network: eight fresh tips burst outward from there.' },
  { id: 'toxin', key: 'F', label: '☠ toxin', cost: COSTS.toxin, title: 'Click near your network: a burst of toxin. Kills grubs and slugs, burns rival hyphae.' },
  { id: 'fruit', key: 'G', label: '🍄 fruit', cost: COSTS.fruit, title: 'Click where your network touches the surface: a mushroom, right there, right now.' },
  { id: 'retract', key: 'R', label: '↩ retract', title: 'Click to withdraw hyphae from a spot and recover a little energy. Cut losses, or cut off a grub.' },
  { id: 'erase', key: 'E', label: '✕ erase', title: 'Erase attractant (right-click or shift-drag also erases).' },
];
const CURSOR = { attract: 'crosshair', lead: 'grab', surge: 'cell', toxin: 'cell', fruit: 'cell', retract: 'cell', erase: 'not-allowed' };

let sim = null, plotIndex = START, mode = 'title', speed = 1, paused = false, tool = 'attract', frame = 0, acc = 0, last = 0;
let hover = null, painting = false, lastPaint = null, leading = false;
let particles = [], texts = [], rain = [], clouds = [], stars = [];
let shakeT = 0, toastT = 0;

// ---------- sound ----------
let actx = null, muted = localStorage.getItem('mycelium-mute') === '1';
function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function sfx(name) {
  if (muted) return; const a = audio(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination);
  const env = (vol, len) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + len); o.start(t); o.stop(t + len + .02); };
  switch (name) {
    case 'spore': o.type = 'sine'; o.frequency.setValueAtTime(1200 + Math.random() * 600, t); o.frequency.exponentialRampToValueAtTime(2400, t + .12); env(.04, .15); break;
    case 'shroom': o.type = 'triangle'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(700, t + .18); env(.12, .25); break;
    case 'bonus': o.type = 'square'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + .08); o.frequency.setValueAtTime(1320, t + .16); env(.07, .35); break;
    case 'goal': o.type = 'triangle'; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(659, t + .1); o.frequency.setValueAtTime(784, t + .2); o.frequency.setValueAtTime(1046, t + .3); env(.1, .5); break;
    case 'toxin': o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + .3); env(.12, .35); break;
    case 'surge': o.type = 'sine'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + .25); env(.1, .3); break;
    case 'hit': o.type = 'square'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + .1); env(.08, .12); break;
    case 'alert': o.type = 'square'; o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(330, t + .12); env(.06, .3); break;
    case 'dig': o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .5); env(.2, .6); break;
    case 'nope': o.type = 'square'; o.frequency.setValueAtTime(160, t); env(.05, .1); break;
    case 'win': o.type = 'triangle'; [523, 659, 784, 1046, 1318].forEach((f, k) => o.frequency.setValueAtTime(f, t + k * .12)); env(.12, .9); break;
    case 'lose': o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(60, t + 1); env(.1, 1.1); break;
    case 'click': o.type = 'square'; o.frequency.setValueAtTime(900, t); env(.03, .05); break;
  }
}
function updateMute() { el.mute.textContent = muted ? '🔇 sound off' : '🔊 sound on'; el.mute.classList.toggle('on', !muted); }
el.mute.addEventListener('click', () => { muted = !muted; localStorage.setItem('mycelium-mute', muted ? '1' : '0'); updateMute(); if (!muted) sfx('click'); });

// ---------- colours ----------
const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const SKY = [
  [0, [10, 12, 30], [28, 30, 58]], [.2, [52, 44, 96], [226, 138, 92]], [.33, [92, 162, 230], [182, 222, 240]],
  [.5, [68, 140, 226], [170, 215, 240]], [.7, [92, 150, 220], [222, 190, 140]], [.8, [52, 40, 90], [228, 108, 72]],
  [.9, [12, 14, 34], [34, 36, 66]], [1, [10, 12, 30], [28, 30, 58]],
];
function skyAt(tod) {
  for (let k = 0; k < SKY.length - 1; k++) {
    const a = SKY[k], b = SKY[k + 1];
    if (tod >= a[0] && tod <= b[0]) { const t = (tod - a[0]) / (b[0] - a[0]); return [lerp3(a[1], b[1], t), lerp3(a[2], b[2], t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
let noise = null;
function makeNoise(seed) { const r = mulberry(seed ^ 0x9e37); noise = new Float32Array(PW * PH); for (let i = 0; i < noise.length; i++) noise[i] = r() - .5; }

// ---------- screens ----------
function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('open', s.id === name);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  mode = name === 'none' ? 'play' : name;
  document.body.classList.toggle('playing', name === 'none');
}
function setupScenery(seed) {
  makeNoise(seed);
  particles = []; texts = []; rain = []; shakeT = 0;
  clouds = []; for (let k = 0; k < 5; k++) clouds.push({ x: Math.random() * PW, y: 4 + Math.random() * 16, w: 14 + Math.random() * 26, v: .05 + Math.random() * .12 });
  stars = []; const r = mulberry(seed); for (let k = 0; k < 40; k++) stars.push({ x: Math.floor(r() * PW), y: Math.floor(r() * 30), p: r() * 6.28 });
}
function startPlot(i) {
  plotIndex = i;
  const kind = plotKind(i);
  sim = new Sim((garden.seed + i * 7919 + garden.plays * 131) >>> 0, kind, DIST[i]);
  garden.plays++; saveGarden();
  setupScenery(sim.seed);
  speed = 1; paused = false; tool = 'attract';
  sim.say(`${PLOT_KINDS[kind].name}. ${PLOT_KINDS[kind].desc}`);
  sim.say('Drag in the soil to lay attractant, or hold LEAD and drag to steer a tip by hand.');
  el.plotName.textContent = PLOT_KINDS[kind].name;
  updateTools(); drawTri(); renderGoals();
  showScreen('none');
}
function demoSim() {
  sim = new Sim((Math.random() * 1e9) >>> 0, 'lawn', 1);
  sim.alloc[0] = { grow: .6, def: .25, fruit: .15 };
  setupScenery(sim.seed);
  sim.demo = true;
}

// ---------- rendering ----------
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const skyCss = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function render() {
  const T = sim.terrain, M = sim.moist, F = sim.food, hy0 = sim.hyph[0], hy1 = sim.hyph[1], tx0 = sim.tox[0], tx1 = sim.tox[1], cn0 = sim.conn[0], cn1 = sim.conn[1], sc = sim.scent;
  const tod = (sim.time % DAY) / DAY;
  let [top, bot] = skyAt(tod);
  const w = sim.weather, gray = w === 'storm' ? .7 : w === 'rain' ? .55 : w === 'cloud' ? .3 : 0;
  if (gray) { top = lerp3(top, [110, 115, 125], gray); bot = lerp3(bot, [150, 152, 160], gray); }
  const night = tod < .22 || tod > .83;
  const skyRows = 24 * S;
  const skyCol = new Uint32Array(skyRows);
  for (let y = 0; y < skyRows; y++) { const c = lerp3(top, bot, y / skyRows); skyCol[y] = rgb(c[0] | 0, c[1] | 0, c[2] | 0); }

  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const i = cy * W + cx, t = T[i];
    const bx = cx * S, by = cy * S;
    if (t === AIR) {
      for (let dy = 0; dy < S; dy++) { const row = (by + dy) * PW + bx, c = skyCol[Math.min(skyRows - 1, by + dy)]; px[row] = c; px[row + 1] = c; px[row + 2] = c; }
      if (cy === sim.sy[cx] - 1) {
        const row = (by + 2) * PW + bx;
        const g1 = rgb(58, 108, 40), g2 = rgb(88, 148, 52);
        px[row] = g1; px[row + 1] = g1; px[row + 2] = g1;
        const tuft = (cx * 7 + 3) % 5;
        if (tuft < 2) px[(by + 1) * PW + bx + tuft] = g2;
        if (tuft === 3) { px[(by + 1) * PW + bx + 1] = g2; px[(by) * PW + bx + 1] = g1; }
      }
      continue;
    }
    let r, g, b;
    const m = M[i];
    if (t === ROCK) { r = 98; g = 98; b = 104; }
    else if (t === WATER) { const sh = Math.sin(sim.time * .08 + cx * .9 + cy) * 12; r = 44; g = 96 + sh; b = 170 + sh; }
    else {
      if (t === CLAY) { r = 118; g = 72; b = 54; } else { r = 78; g = 56; b = 40; }
      if (t === FOOD) { const f = Math.min(1, F[i] / 80); r = lerp(r, 152, f); g = lerp(g, 100, f); b = lerp(b, 42, f); }
      if (t === LROOT) { r = 126; g = 150; b = 64; }
      if (sim.dist[i]) { r += 18; g += 14; b += 10; }
      const dark = 1 - .38 * m;
      r *= dark; g *= dark; b = b * dark + m * 12;
      const a = tx0[i], c2 = tx1[i];
      if (a > .04) { const k = Math.min(.5, a * .5); r = lerp(r, 140, k); g = lerp(g, 80, k); b = lerp(b, 190, k); }
      if (c2 > .04) { const k = Math.min(.5, c2 * .5); r = lerp(r, 160, k); g = lerp(g, 170, k); b = lerp(b, 50, k); }
    }
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const pi = (by + dy) * PW + bx + dx;
      let n = noise[pi] * (t === ROCK ? 22 : t === WATER ? 6 : t === LROOT ? 14 : 26);
      if (t === ROCK) { if (dx === 0 && dy === 0) n += 30; if (dx === 2 && dy === 2) n -= 26; }
      if (t === FOOD && ((dx + dy + cx) % 3 === 0)) n -= 28;
      if (t === LROOT && dx === 1) n += 22;
      px[pi] = rgb(clamp8(r + n), clamp8(g + n), clamp8(b + n));
    }
    const s = sc[i];
    if (s > .04 && ((cx + cy + (frame >> 3)) & 1)) {
      const k = Math.min(1, s * 1.2);
      const pi = (by + 1) * PW + bx + 1;
      px[pi] = rgb(clamp8(lerp(r, 90, k)), clamp8(lerp(g, 225, k)), clamp8(lerp(b, 235, k)));
    }
  }
  // a glint now and then where something is buried
  for (const [i] of sim.bonus) if (((frame + i * 7) % 160) < 5) { const cx = i % W, cy = (i - cx) / W; px[(cy * S + 1) * PW + cx * S + 1] = rgb(255, 255, 230); }
  // hyphae threads
  for (let s = 0; s < 2; s++) {
    const hy = s ? hy1 : hy0, cn = s ? cn1 : cn0;
    const col = s ? [236, 122, 46] : [238, 232, 206], cut = s ? [140, 80, 50] : [150, 146, 130];
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx, d = hy[i];
      if (d <= 0) continue;
      const c = cn[i] ? col : cut;
      const k = .45 + .55 * d;
      const bx = cx * S, by = cy * S;
      const base = px[(by + 1) * PW + bx + 1];
      const br = base & 255, bg = (base >> 8) & 255, bb = (base >> 16) & 255;
      const color = rgb(lerp(br, c[0], k) | 0, lerp(bg, c[1], k) | 0, lerp(bb, c[2], k) | 0);
      px[(by + 1) * PW + bx + 1] = color;
      if (cx + 1 < W && hy[i + 1] > 0) px[(by + 1) * PW + bx + 2] = color;
      if (cy + 1 < H && hy[i + W] > 0) px[(by + 2) * PW + bx + 1] = color;
      if (cx + 1 < W && cy + 1 < H && hy[i + W + 1] > 0) px[(by + 2) * PW + bx + 2] = color;
      if (cx > 0 && cy + 1 < H && hy[i + W - 1] > 0) px[(by + 2) * PW + bx] = color;
      if (d > .72) {
        const cc = rgb(Math.min(255, c[0] + 12), Math.min(255, c[1] + 12), Math.min(255, c[2] + 12));
        px[(by + 1) * PW + bx] = cc; px[(by + 1) * PW + bx + 2] = cc; px[by * PW + bx + 1] = cc; px[(by + 2) * PW + bx + 1] = cc;
      }
    }
  }
  if (night) for (const st of stars) if (T[Math.floor(st.y / S) * W + Math.floor(st.x / S)] === AIR && Math.sin(frame * .05 + st.p) > -.2) px[st.y * PW + st.x] = rgb(220, 224, 240);
  ctx.putImageData(img, 0, 0);

  // sun / moon
  const surfPx = 12 * S;
  if (tod > .22 && tod < .8) {
    const f = (tod - .22) / .58, ang = f * Math.PI;
    const sx = Math.round(PW * (.08 + .84 * f)), sy = Math.round(surfPx + 6 - Math.sin(ang) * 34);
    blockyDisc(sx, sy, 4, gray > .4 ? '#d8d2b8' : '#ffe27a'); if (gray < .4) blockyDisc(sx, sy, 2, '#fff6c8');
  } else {
    const f = tod > .8 ? (tod - .8) / .42 : (tod + .2) / .42, ang = f * Math.PI;
    const sx = Math.round(PW * (.08 + .84 * f)), sy = Math.round(surfPx + 6 - Math.sin(ang) * 34);
    blockyDisc(sx, sy, 3, '#e8e8f0'); blockyDisc(sx + 2, sy - 1, 2, skyCss(top));
  }
  for (const c of clouds) {
    c.x += c.v * (w === 'storm' ? 3 : 1); if (c.x > PW + 40) c.x = -40;
    ctx.fillStyle = gray > .4 ? 'rgba(120,124,135,.9)' : night ? 'rgba(90,96,120,.8)' : 'rgba(255,255,255,.9)';
    const x = Math.round(c.x), y = Math.round(c.y), ww = Math.round(c.w);
    ctx.fillRect(x, y + 3, ww, 3); ctx.fillRect(x + 3, y, ww - 8, 3); ctx.fillRect(x + 6, y - 2, Math.max(4, ww - 16), 2);
  }
  if (w === 'rain' || w === 'storm') {
    const want = w === 'storm' ? 110 : 55;
    while (rain.length < want) rain.push({ x: Math.random() * PW, y: Math.random() * 40, v: 3 + Math.random() * 2 });
    ctx.fillStyle = 'rgba(190,215,245,.75)';
    for (const d of rain) {
      d.y += d.v * speed; d.x += w === 'storm' ? 1.2 : .3;
      const cx = Math.floor(d.x / S); if (cx >= W || d.y > sim.sy[Math.max(0, Math.min(W - 1, cx))] * S) { d.y = -5; d.x = Math.random() * PW; continue; }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
    }
  } else rain.length = 0;

  for (const m of sim.shrooms) drawShroom(m);
  for (const sl of sim.slugs) drawSlug(sl);
  for (const g of sim.grubs) drawGrub(g);
  for (let s = 0; s < 2; s++) {
    ctx.fillStyle = s ? '#ffd090' : '#ffffff';
    for (const t of sim.tips[s]) ctx.fillRect(Math.round(t.x) * S + 1, Math.round(t.y) * S + 1, 1, 1);
  }
  // the lead tip
  if (sim.pilot) {
    const p = sim.pilot, x = Math.round(p.x) * S + 1, y = Math.round(p.y) * S + 1, pulse = (Math.sin(frame * .4) + 1) / 2;
    ctx.fillStyle = `rgba(160,255,240,${.5 + .5 * pulse})`;
    ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
    const tx = Math.round(p.tx) * S + 1, ty = Math.round(p.ty) * S + 1;
    ctx.fillStyle = 'rgba(160,255,240,.6)'; ctx.fillRect(tx - 3, ty, 7, 1); ctx.fillRect(tx, ty - 3, 1, 7);
  }
  for (let s = 0; s < 2; s++) {
    const c = sim.core[s], pulse = (Math.sin(frame * .08) + 1) / 2;
    ctx.fillStyle = s ? `rgba(255,170,90,${.35 + .4 * pulse})` : `rgba(255,255,230,${.35 + .4 * pulse})`;
    const x = c.x * S - 2, y = c.y * S - 2;
    ctx.fillRect(x, y, 7, 1); ctx.fillRect(x, y + 6, 7, 1); ctx.fillRect(x, y, 1, 7); ctx.fillRect(x + 6, y, 1, 7);
  }
  if (sim.spade) drawSpade(sim.spade);
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k]; p.t++;
    p.x += p.vx + Math.sin(p.t * .1 + p.ph) * .15; p.y += p.vy; p.vy *= .99;
    if (p.t > p.life) { particles.splice(k, 1); continue; }
    ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, (p.life - p.t) / 30);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
  // floating text
  ctx.font = '8px "VT323", monospace'; ctx.textAlign = 'center';
  for (let k = texts.length - 1; k >= 0; k--) {
    const t = texts[k]; t.t++;
    if (t.t > 110) { texts.splice(k, 1); continue; }
    ctx.globalAlpha = t.t < 80 ? 1 : (110 - t.t) / 30;
    const x = Math.round(t.x), y = Math.round(t.y - t.t * .12);
    ctx.fillStyle = '#000'; ctx.fillText(t.text, x + 1, y + 1); ctx.fillStyle = t.col; ctx.fillText(t.text, x, y);
  }
  ctx.globalAlpha = 1;
  // hover brush
  if (hover && mode === 'play') {
    const hx = hover.x * S + 1.5, hy = hover.y * S + 1.5;
    const rad = { attract: 5, erase: 5, surge: 5, toxin: 4, retract: 3, fruit: 4, lead: 1 }[tool];
    ctx.strokeStyle = { attract: 'rgba(120,240,240,.8)', erase: 'rgba(255,120,120,.8)', surge: 'rgba(255,255,255,.8)', toxin: 'rgba(200,120,255,.9)', retract: 'rgba(200,200,200,.8)', fruit: 'rgba(255,210,120,.9)', lead: 'rgba(160,255,240,.9)' }[tool];
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx, hy, rad * S, 0, 6.283); ctx.stroke();
    if (tool === 'fruit') { ctx.strokeRect(hover.x * S - 12, sim.sy[hover.x] * S - 14, 27, 16); }
    const near = creatureAt(hover.x, hover.y);
    if (near && tool === 'attract') { ctx.strokeStyle = 'rgba(200,120,255,.9)'; ctx.strokeRect(Math.round(near.x) * S - 6, Math.round(near.y) * S - 5, 15, 13); }
  }
  if (night) { ctx.fillStyle = 'rgba(10,10,30,.18)'; ctx.fillRect(0, 0, PW, PH); }
}
function blockyDisc(cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let y = -r; y <= r; y++) { const hw = Math.round(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); }
}
const CAPS = [[['#c99a52', '#f1e2bd'], ['#c93c3a', '#fff1e4'], ['#8a5a3a', '#d9b48a']], [['#e87a2e', '#ffd0a0'], ['#d85a1e', '#ffc080'], ['#f0963c', '#ffe0b0']]];
function drawShroom(m) {
  const gx = m.x * S + 1, gy = sim.sy[m.x] * S;
  const st = m.phase === 2 ? m.stage : Math.max(.08, m.stage);
  const h = Math.max(1, Math.round(m.size * st)), capW = Math.max(3, Math.round((m.size * .9 + 3) * st)), capH = Math.max(1, Math.round((m.size * .4 + 1) * st));
  const [capCol, spot] = CAPS[m.side][m.kind];
  const wilt = m.phase === 2 ? 1 - m.stage : 0;
  ctx.fillStyle = m.side ? '#b89070' : '#efe6cf';
  if (wilt) ctx.fillStyle = m.side ? '#7a604a' : '#a39b86';
  const stemW = h > 6 ? 2 : 1;
  const lean = Math.round(wilt * 3) * (m.flip ? -1 : 1);
  ctx.fillRect(gx - (stemW >> 1) + lean, gy - h, stemW, h);
  ctx.fillStyle = wilt ? shade(capCol, -60 * wilt) : capCol;
  const cx = gx + lean - (capW >> 1), cy = gy - h - capH;
  ctx.fillRect(cx, cy + 1, capW, capH);
  ctx.fillRect(cx + 1, cy, capW - 2, 1);
  if (m.bitten) { ctx.fillStyle = '#2a2018'; ctx.fillRect(cx + capW - 2, cy + 1, 2, Math.min(capH, 2)); }
  if (capH > 1) { ctx.fillStyle = wilt ? '#777' : spot; ctx.fillRect(cx + 1, cy + 1, 1, 1); if (capW > 5) ctx.fillRect(cx + capW - 3, cy + 2, 1, 1); if (capW > 8) ctx.fillRect(cx + (capW >> 1), cy + 1, 1, 1); }
  if (m.phase === 1 && !m.side) { ctx.fillStyle = `rgba(255,255,255,${.25 + .25 * Math.sin(frame * .2)})`; ctx.fillRect(cx, cy + capH + 1, capW, 1); }
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const r = clamp8((n >> 16) + d), g = clamp8(((n >> 8) & 255) + d), b = clamp8((n & 255) + d); return `rgb(${r},${g},${b})`; }
function drawGrub(g) {
  const x = Math.round(g.x) * S + 1, y = Math.round(g.y) * S + 1, f = Math.floor(g.t / 6) % 2, dir = Math.cos(g.a) >= 0 ? 1 : -1;
  ctx.fillStyle = g.hurt ? '#ff9a7a' : '#ece0c4';
  ctx.fillRect(x - 3 * dir, y - 1 + f, 3, 3); ctx.fillRect(x - 6 * dir + (dir > 0 ? 0 : 3), y - 1 + (1 - f), 3, 3);
  ctx.fillStyle = '#7a5030'; ctx.fillRect(x + (dir > 0 ? 0 : -2), y - 1, 3, 3);
  ctx.fillStyle = '#201008'; ctx.fillRect(x + (dir > 0 ? 2 : -2), y - 1, 1, 1);
}
function drawSlug(sl) {
  const cx = Math.max(0, Math.min(W - 1, Math.round(sl.x)));
  const x = Math.round(sl.x * S), y = sim.sy[cx] * S, f = Math.floor(sl.t / 8) % 2, d = sl.dir;
  ctx.fillStyle = sl.hurt ? '#ffb090' : '#8a7868';
  ctx.fillRect(x - 4, y - 3, 9 + f, 3); ctx.fillRect(x - 3, y - 4, 6, 1);
  ctx.fillStyle = '#5a4838'; ctx.fillRect(x - 2, y - 3, 4, 1);
  ctx.fillStyle = sl.hurt ? '#ffb090' : '#8a7868'; ctx.fillRect(x + 4 * d, y - 6, 1, 3); ctx.fillRect(x + 2 * d, y - 5, 1, 2);
  ctx.fillStyle = '#111'; ctx.fillRect(x + 4 * d, y - 7, 1, 1); ctx.fillRect(x + 2 * d, y - 6, 1, 1);
}
function drawSpade(sp) {
  const x = sp.x * S + 1, gy = sim.sy[sp.x] * S;
  const f = sp.t < sp.dur ? sp.t / sp.dur : Math.max(0, 1 - (sp.t - sp.dur) / 40);
  const y = -40 + (gy + 90 + 40) * f * f;
  const bladeTop = Math.min(y, gy + 90);
  if (sp.t === sp.dur) { shakeT = 12; sfx('dig'); }
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x - 10, bladeTop - 30, 21, 30);
  ctx.fillStyle = '#c8ced6'; ctx.fillRect(x - 9, bladeTop - 29, 3, 28);
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 2, bladeTop - 130, 5, 100);
  ctx.fillStyle = '#4a2a16'; ctx.fillRect(x - 8, bladeTop - 134, 17, 6);
}
function creatureAt(x, y) {
  for (const g of sim.grubs) if (Math.hypot(g.x - x, g.y - y) < 3) return { x: g.x, y: g.y, kind: 'grub' };
  for (const sl of sim.slugs) { const cx = Math.max(0, Math.min(W - 1, Math.round(sl.x))); if (Math.abs(sl.x - x) < 3.5 && Math.abs(sim.sy[cx] - y) < 4) return { x: sl.x, y: sim.sy[cx] - 1, kind: 'slug' }; }
  return null;
}

// ---------- allocation triangle ----------
const TRI = { ax: 60, ay: 8, bx: 8, by: 96, cx: 112, cy: 96 };
function drawTri() {
  const a = sim ? sim.alloc[0] : { grow: .6, def: .2, fruit: .2 };
  const c = tctx; c.clearRect(0, 0, tri.width, tri.height);
  c.fillStyle = '#1a2a22'; c.beginPath(); c.moveTo(TRI.ax, TRI.ay); c.lineTo(TRI.bx, TRI.by); c.lineTo(TRI.cx, TRI.cy); c.closePath(); c.fill();
  c.strokeStyle = '#6f9b7a'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(111,155,122,.25)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(TRI.ax, TRI.ay); c.lineTo((TRI.bx + TRI.cx) / 2, TRI.by); c.moveTo(TRI.bx, TRI.by); c.lineTo((TRI.ax + TRI.cx) / 2, (TRI.ay + TRI.cy) / 2); c.moveTo(TRI.cx, TRI.cy); c.lineTo((TRI.ax + TRI.bx) / 2, (TRI.ay + TRI.by) / 2); c.stroke();
  const x = a.grow * TRI.ax + a.def * TRI.bx + a.fruit * TRI.cx, y = a.grow * TRI.ay + a.def * TRI.by + a.fruit * TRI.cy;
  c.fillStyle = '#f3efe2'; c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); c.fillStyle = '#19221e'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  el.pct.textContent = `grow ${Math.round(a.grow * 100)}%  ·  defend ${Math.round(a.def * 100)}%  ·  fruit ${Math.round(a.fruit * 100)}%`;
}
function triPick(ev) {
  const r = tri.getBoundingClientRect();
  const x = (ev.clientX - r.left) * tri.width / r.width, y = (ev.clientY - r.top) * tri.height / r.height;
  const det = (TRI.by - TRI.cy) * (TRI.ax - TRI.cx) + (TRI.cx - TRI.bx) * (TRI.ay - TRI.cy);
  let g = ((TRI.by - TRI.cy) * (x - TRI.cx) + (TRI.cx - TRI.bx) * (y - TRI.cy)) / det;
  let d = ((TRI.cy - TRI.ay) * (x - TRI.cx) + (TRI.ax - TRI.cx) * (y - TRI.cy)) / det;
  g = Math.max(0, Math.min(1, g)); d = Math.max(0, Math.min(1 - g, d));
  const f = Math.max(0, 1 - g - d);
  if (sim) sim.setAlloc(g, d, f);
  drawTri();
}
let triDown = false;
tri.addEventListener('pointerdown', e => { triDown = true; tri.setPointerCapture(e.pointerId); triPick(e); });
tri.addEventListener('pointermove', e => { if (triDown) triPick(e); });
tri.addEventListener('pointerup', () => triDown = false);
tri.addEventListener('pointercancel', () => triDown = false);
for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => { const [g, d, f] = b.dataset.preset.split(',').map(Number); if (sim) sim.setAlloc(g, d, f); drawTri(); sfx('click'); });

// ---------- tools ----------
function buildTools() {
  el.tools.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button'); b.className = 'btn tool'; b.dataset.tool = t.id; b.title = t.title + ` [${t.key}]`;
    b.innerHTML = `<span>${t.label}</span>` + (t.cost ? `<small>${t.cost}⚡</small>` : `<small>${t.key}</small>`);
    b.addEventListener('click', () => { tool = t.id; updateTools(); sfx('click'); toast(t.title); });
    el.tools.appendChild(b);
  }
}
function updateTools() {
  for (const b of el.tools.children) {
    const t = TOOLS.find(x => x.id === b.dataset.tool);
    b.classList.toggle('on', tool === t.id);
    b.classList.toggle('poor', !!(t.cost && sim && sim.energy[0] < t.cost));
  }
  el.pause.textContent = paused ? '▶ resume' : '❚❚ pause'; el.pause.classList.toggle('on', paused);
  for (const b of el.speed) b.classList.toggle('on', Number(b.dataset.speed) === speed);
  cv.style.cursor = CURSOR[tool] || 'crosshair';
}
function toast(msg, bad) { el.toast.textContent = msg; el.toast.classList.toggle('bad', !!bad); el.toast.classList.add('show'); toastT = 150; }
function useTool(c, e) {
  const er = e && (e.button === 2 || e.shiftKey);
  if (tool === 'attract' && !er) {
    const near = creatureAt(c.x, c.y);
    if (near) { const r = sim.toxinBurst(Math.round(near.x), Math.round(near.y)); if (r) { toast(r, true); sfx('nope'); } else sfx('toxin'); return false; }
    sim.paint(c.x, c.y, false, 1); return true;
  }
  if (tool === 'erase' || er) { sim.paint(c.x, c.y, true, 1); return true; }
  if (tool === 'lead') { sim.lead(c.x, c.y, true); leading = true; return true; }
  let r = '';
  if (tool === 'surge') { r = sim.surge(c.x, c.y); if (!r) sfx('surge'); }
  else if (tool === 'toxin') { r = sim.toxinBurst(c.x, c.y); if (!r) sfx('toxin'); }
  else if (tool === 'fruit') { r = sim.fruitAt(c.x); if (!r) { sfx('shroom'); texts.push({ x: c.x * S, y: sim.sy[c.x] * S - 12, text: 'fruit!', col: '#ffd890', t: 0 }); } }
  else if (tool === 'retract') { r = sim.retract(c.x, c.y); if (!r) sfx('hit'); }
  if (r) { toast(r, true); sfx('nope'); }
  return false;
}

// ---------- world input ----------
function cellFromEvent(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return { x, y };
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  audio();
  const c = cellFromEvent(e); if (!c) return;
  cv.setPointerCapture(e.pointerId);
  hover = c; lastPaint = c;
  painting = useTool(c, e);
});
cv.addEventListener('pointermove', e => {
  const c = cellFromEvent(e); hover = c;
  if (!painting || !c || mode !== 'play') return;
  if (leading) { sim.lead(c.x, c.y, false); return; }
  const er = tool === 'erase' || (e.buttons & 2) || e.shiftKey;
  if (lastPaint) { const n = Math.max(1, Math.hypot(c.x - lastPaint.x, c.y - lastPaint.y)); for (let k = 1; k <= n; k++) sim.paint(Math.round(lerp(lastPaint.x, c.x, k / n)), Math.round(lerp(lastPaint.y, c.y, k / n)), er, .35); }
  else sim.paint(c.x, c.y, er, .5);
  lastPaint = c;
});
const stopPaint = () => { painting = false; lastPaint = null; if (leading) { leading = false; if (sim) sim.release(); } };
cv.addEventListener('pointerup', stopPaint); cv.addEventListener('pointercancel', stopPaint);
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());

el.pause.addEventListener('click', () => { paused = !paused; updateTools(); });
for (const b of el.speed) b.addEventListener('click', () => { speed = Number(b.dataset.speed); paused = false; updateTools(); });
$('#helpBtn').addEventListener('click', () => openHelp());
$('#gardenBtn').addEventListener('click', () => { if (confirm('Abandon this plot and return to the garden? Spores already shed are kept.')) endPlot(false); });
window.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea')) return;
  if (mode === 'help') { if (e.key === 'Escape' || e.key === 'h' || e.key === 'H') closeHelp(); return; }
  if (mode !== 'play') return;
  const k = e.key.toUpperCase();
  if (e.code === 'Space') { e.preventDefault(); paused = !paused; }
  else if (k === '1' || k === '2' || k === '3') { speed = Number(k); paused = false; }
  else if (k === 'H' || k === '?') openHelp();
  else if (k === 'Q') { for (const b of document.querySelectorAll('[data-preset]')) if (b.dataset.key === 'q') b.click(); }
  else { const t = TOOLS.find(t => t.key === k); if (t) { tool = t.id; sfx('click'); } }
  updateTools();
});
let helpReturn = 'play';
function openHelp() { helpReturn = mode; showScreen('help'); mode = 'help'; }
function closeHelp() { if (helpReturn === 'play') showScreen('none'); else showScreen(helpReturn); }
$('#helpClose').addEventListener('click', closeHelp);

// ---------- HUD ----------
function hud() {
  if (!sim) return;
  const e = Math.max(0, sim.energy[0]);
  el.energy.textContent = Math.round(e); el.energyBar.style.width = Math.min(100, e / 8) + '%';
  el.energyBar.className = 'fill ' + (sim.starving[0] ? 'bad' : e < 60 ? 'warn' : 'good');
  el.net.textContent = sim.hyphCount[0]; el.tips.textContent = sim.tips[0].length;
  const wtr = sim.avgMoisture(0); el.water.textContent = Math.round(wtr * 100) + '%'; el.waterBar.style.width = Math.round(wtr * 100) + '%';
  el.waterBar.className = 'fill ' + (wtr < .18 ? 'bad' : wtr < .3 ? 'warn' : 'blue');
  el.spores.textContent = `${sim.spores[0]} / ${sim.sporeTarget}`; el.sporeBar.style.width = Math.min(100, sim.spores[0] / sim.sporeTarget * 100) + '%';
  el.bank.textContent = garden ? garden.bank + sim.spores[0] : sim.spores[0];
  el.shroomsN.textContent = sim.shrooms.filter(m => m.side === 0 && m.phase < 2).length;
  const rv = sim.hyphCount[1]; el.rival.textContent = rv; el.rivalBar.style.width = Math.min(100, rv / Math.max(1, rv + sim.hyphCount[0]) * 100) + '%';
  el.grubs.textContent = sim.grubs.length + sim.slugs.length; el.coreHp.textContent = '♥'.repeat(sim.coreHp[0]) + '♡'.repeat(5 - sim.coreHp[0]);
  el.day.textContent = `Day ${sim.day}`;
  el.weather.textContent = { sun: '☀ sunny', cloud: '☁ overcast', rain: '🌧 rain', storm: '⛈ storm' }[sim.weather];
  const items = sim.log.slice(-5).reverse();
  el.log.innerHTML = items.map((l, k) => `<div class="${k === 0 && sim.time - l.t < 90 ? 'fresh' : ''}">${l.msg}</div>`).join('');
  for (const b of el.tools.children) { const t = TOOLS.find(x => x.id === b.dataset.tool); b.classList.toggle('poor', !!(t.cost && sim.energy[0] < t.cost)); }
  if (frame % 30 === 0) renderGoals();
}
function renderGoals() {
  if (!sim) return;
  el.goals.innerHTML = sim.goals.map(g => `<li class="${g.done ? 'done' : ''}"><span>${g.done ? '☑' : '☐'}</span> ${g.text} <em>+${g.reward}</em></li>`).join('');
}

// ---------- plot end ----------
function endPlot(fromSim) {
  const shed = sim ? sim.spores[0] : 0;
  garden.bank += shed;
  const won = fromSim && sim.state === 'won';
  if (won) garden.held[plotIndex] = true;
  const total = garden.held.filter(Boolean).length, needed = GARDEN.flat().filter(k => k !== 'patio').length;
  if (total >= needed) garden.won = true;
  saveGarden();
  sfx(won ? 'win' : 'lose');
  const r = $('#result');
  r.querySelector('h2').textContent = won ? (garden.won ? 'The garden is yours.' : 'Plot claimed!') : fromSim ? 'The colony withered.' : 'Plot abandoned.';
  const why = won ? (sim.result === 'rival' ? 'The rival colony has been consumed. Your network owns this soil.' : 'Your spores have saturated this patch. Whatever grows here now, grows from you.')
    : fromSim ? (sim.result === 'consumed' ? 'The rival ate its way to your core. What is left of you is now part of it.' : 'Starved and cut off, the last threads dissolved into the soil.') : 'Your hyphae here will fade, but the spores you shed are already in the air.';
  r.querySelector('p.why').textContent = why;
  const st = sim.stats;
  r.querySelector('p.shed').innerHTML = `<b>${shed}</b> spores shed on this plot · spore bank now <b>${garden.bank}</b><br><span class="dim">${sim.goals.filter(g => g.done).length}/${sim.goals.length} goals · ${st.grubs} grubs and ${st.slugs} slugs poisoned · ${st.fights} fights won · day ${sim.day}</span>`;
  showScreen('result');
  if (garden.won) $('#result p.shed').innerHTML += '<br>Every plot in the garden carries your mycelium. Replay plots to keep fruiting, or start a new garden.';
}
$('#toGarden').addEventListener('click', () => openGarden());

// ---------- garden map ----------
function openGarden() {
  showScreen('garden');
  const grid = $('#plots'); grid.innerHTML = '';
  $('#bankBig').textContent = garden.bank;
  const anyHeld = garden.held.some(Boolean);
  for (let i = 0; i < COLS * ROWS; i++) {
    const kind = plotKind(i), info = PLOT_KINDS[kind];
    const b = document.createElement('button'); b.className = 'plot ' + kind;
    const held = garden.held[i];
    const reachable = !info.barren && (i === START && !anyHeld || neighbors(i).some(n => garden.held[n]) || held);
    const cost = held ? 0 : (i === START && !anyHeld ? 0 : sporeCost(i));
    const afford = garden.bank >= cost;
    let status = info.barren ? 'concrete' : held ? 'yours' : !reachable ? 'out of reach' : cost === 0 ? 'start here' : `${cost} spores`;
    b.disabled = info.barren || !reachable || (!held && !afford);
    if (held) b.classList.add('held'); else if (reachable && afford) b.classList.add('ready'); else if (reachable) b.classList.add('poor');
    const c = document.createElement('canvas'); c.width = 96; c.height = 60; drawPlotTile(c, kind, i, held);
    b.appendChild(c);
    const t = document.createElement('div'); t.className = 'ptext';
    t.innerHTML = `<b>${info.name}</b><span>${status}</span>` + (info.barren ? '' : `<em>difficulty ${DIST[i] + 1}</em>`);
    b.appendChild(t);
    b.title = info.desc + (held ? ' Replay to shed more spores.' : '');
    b.addEventListener('click', () => {
      if (!held && cost > 0) { garden.bank -= cost; saveGarden(); }
      sfx('click'); startPlot(i);
    });
    grid.appendChild(b);
  }
  $('#gardenNote').textContent = garden.won ? 'The whole garden is yours. Plots can be replayed for the joy of it.'
    : anyHeld ? 'Spend spores to drift onto a plot next to one you hold. Replaying a held plot sheds more spores.'
      : 'Start in the bottom-left corner. Win a plot by consuming the rival core or by shedding enough spores there.';
}
function drawPlotTile(c, kind, i, held) {
  const g = c.getContext('2d'); const r = mulberry(1234 + i * 77);
  const base = { lawn: [70, 130, 50], bed: [96, 62, 40], compost: [60, 42, 28], tree: [40, 90, 40], path: [130, 124, 112], pond: [60, 110, 150], patio: [150, 150, 150] }[kind];
  for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) {
    const n = (r() - .5) * 30; g.fillStyle = `rgb(${clamp8(base[0] + n)},${clamp8(base[1] + n)},${clamp8(base[2] + n)})`; g.fillRect(x, y, 3, 3);
  }
  if (kind === 'bed') for (let k = 0; k < 14; k++) { g.fillStyle = ['#e85a7a', '#f2d35a', '#f0f0f0', '#c060e0'][k % 4]; const x = 6 + r() * 84, y = 6 + r() * 48; g.fillRect(x | 0, y | 0, 3, 3); g.fillStyle = '#4a9a3a'; g.fillRect(x | 0, (y | 0) + 3, 3, 3); }
  if (kind === 'tree') { g.fillStyle = '#5a3a22'; g.fillRect(45, 30, 6, 30); g.fillStyle = '#2f6b2a'; g.fillRect(24, 6, 48, 30); g.fillRect(30, 0, 36, 6); g.fillStyle = '#3f8a35'; for (let k = 0; k < 20; k++) g.fillRect((26 + r() * 42) | 0, (2 + r() * 30) | 0, 3, 3); }
  if (kind === 'compost') { g.fillStyle = '#3a2a1a'; g.fillRect(12, 18, 72, 36); g.fillStyle = '#8a6a3a'; for (let k = 0; k < 24; k++) g.fillRect((14 + r() * 68) | 0, (20 + r() * 32) | 0, 3, 3); g.fillStyle = '#9a9a9a'; g.fillRect(10, 16, 3, 40); g.fillRect(83, 16, 3, 40); }
  if (kind === 'path') { g.fillStyle = '#a09a90'; for (let k = 0; k < 30; k++) g.fillRect((r() * 94) | 0, (r() * 58) | 0, 3, 3); g.fillStyle = '#6a665e'; for (let k = 0; k < 14; k++) g.fillRect((r() * 94) | 0, (r() * 58) | 0, 3, 3); }
  if (kind === 'pond') { g.fillStyle = '#3a6aa0'; g.fillRect(30, 15, 60, 36); g.fillStyle = '#8ab0e0'; g.fillRect(36, 21, 12, 3); g.fillRect(60, 36, 15, 3); g.fillStyle = '#5a9a4a'; g.fillRect(0, 0, 30, 60); g.fillStyle = '#3a7a3a'; for (let k = 0; k < 8; k++) g.fillRect((r() * 27) | 0, (r() * 57) | 0, 3, 3); }
  if (kind === 'patio') { g.strokeStyle = '#a8a8a8'; g.lineWidth = 2; for (let x = 0; x <= 96; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 60); g.stroke(); } for (let y = 0; y <= 60; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(96, y); g.stroke(); } }
  if (held) {
    g.fillStyle = 'rgba(238,232,206,.55)';
    for (let k = 0; k < 60; k++) g.fillRect((r() * 96) | 0, (r() * 60) | 0, 1 + (r() < .3 ? 1 : 0), 1);
    for (let k = 0; k < 5; k++) { const x = (8 + r() * 80) | 0, y = (14 + r() * 36) | 0; g.fillStyle = '#efe6cf'; g.fillRect(x, y, 2, 6); g.fillStyle = ['#c99a52', '#c93c3a', '#efe6cf'][k % 3]; g.fillRect(x - 2, y - 3, 6, 4); g.fillRect(x - 1, y - 4, 4, 1); }
  }
}
$('#newGarden').addEventListener('click', () => { if (!garden || garden.plays === 0 || confirm('Start a fresh garden? Your held plots and spore bank will be lost.')) { newGarden(); openGarden(); } });
$('#gardenHelp').addEventListener('click', () => openHelp());

// ---------- title ----------
$('#playBtn').addEventListener('click', () => { audio(); if (!garden) newGarden(); openGarden(); });
$('#titleHelp').addEventListener('click', () => openHelp());
function updateTitle() { $('#playBtn').textContent = garden && garden.plays ? 'Continue garden' : 'New garden'; }

// ---------- main loop ----------
function fit() {
  const r = stage.getBoundingClientRect();
  const sc = Math.min(r.width / PW, r.height / PH);
  const wpx = Math.max(1, Math.floor(PW * sc)), hpx = Math.max(1, Math.floor(PH * sc));
  cv.style.width = wpx + 'px'; cv.style.height = hpx + 'px';
}
window.addEventListener('resize', fit);

function demoSteer() {
  if (sim.time % 120 !== 1) return;
  let best = -1, bi = -1;
  for (let i = 0; i < W * H; i++) if (sim.terrain[i] === FOOD && sim.hyph[0][i] <= 0) { const x = i % W, y = (i - x) / W; const v = sim.food[i] / (1 + Math.hypot(x - sim.core[0].x, y - sim.core[0].y) * .1); if (v > best) { best = v; bi = i; } }
  if (bi >= 0) sim.paint(bi % W, Math.floor(bi / W), false, .8);
  if (sim.state !== 'play') demoSim();
}

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts;
  frame++;
  if (toastT > 0 && --toastT === 0) el.toast.classList.remove('show');
  if (sim) {
    const running = mode === 'play' ? !paused : mode === 'title' || (mode === 'help' && helpReturn === 'title');
    if (running) {
      acc += dt * TPS * (mode === 'play' ? speed : 1);
      let n = 0;
      while (acc >= 1 && n < 8) { sim.tick(); acc--; n++; if (sim.demo) demoSteer(); }
      if (acc > 8) acc = 0;
    }
    for (const f of sim.fx) spawnFx(f);
    sim.fx.length = 0;
    if (mode === 'play' && sim.state !== 'play') { endPlot(true); }
    if (shakeT > 0) { shakeT--; cv.style.transform = `translate(${(Math.random() - .5) * 6}px,${(Math.random() - .5) * 6}px)`; } else cv.style.transform = '';
    render();
    if (mode === 'play' && frame % 6 === 0) hud();
  }
}
let lastLogLen = 0;
function spawnFx(f) {
  const inPlay = mode === 'play';
  if (f.type === 'spore') {
    for (let k = 0; k < 3; k++) particles.push({ x: f.x * S + 1 + (Math.random() - .5) * 6, y: f.y * S - f.size - 2, vx: .15 + Math.random() * .35, vy: -.3 - Math.random() * .4, t: 0, life: 80 + Math.random() * 60, ph: Math.random() * 6, sz: 1, col: f.side ? '#ffc890' : '#fffbe8' });
    if (inPlay && !f.side && Math.random() < .5) sfx('spore');
  } else if (f.type === 'grubdeath') {
    for (let k = 0; k < 14; k++) particles.push({ x: f.x * S + 1, y: f.y * S + 1, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, t: 0, life: 25 + Math.random() * 20, ph: 0, sz: 2, col: k % 3 ? '#ece0c4' : '#c08060' });
    if (inPlay) sfx('hit');
  } else if (f.type === 'dig') {
    for (let k = 0; k < 40; k++) particles.push({ x: f.x * S + (Math.random() - .5) * 24, y: f.y * S, vx: (Math.random() - .5) * 3, vy: -1 - Math.random() * 3, t: 0, life: 30 + Math.random() * 30, ph: 0, sz: 2, col: k % 4 ? '#6a4a30' : '#3f8a35' });
  } else if (f.type === 'leaf') {
    particles.push({ x: f.x * S + 1, y: f.y * S - 40, vx: (Math.random() - .5) * .6, vy: .5, t: 0, life: 75, ph: Math.random() * 6, sz: 2, col: ['#c0782e', '#d8a040', '#a05a28'][Math.floor(Math.random() * 3)] });
  } else if (f.type === 'surge') {
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283; particles.push({ x: f.x * S + 1, y: f.y * S + 1, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, t: 0, life: 20, ph: 0, sz: 1, col: '#ffffff' }); }
  } else if (f.type === 'toxin') {
    for (let k = 0; k < 24; k++) { const a = Math.random() * 6.283, v = Math.random() * 1.5; particles.push({ x: f.x * S + 1, y: f.y * S + 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 25 + Math.random() * 20, ph: 0, sz: 2, col: k % 2 ? '#b070ff' : '#7030c0' }); }
    shakeT = Math.max(shakeT, 4);
  } else if (f.type === 'bonus') {
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; particles.push({ x: f.x * S + 1, y: f.y * S + 1, vx: Math.cos(a) * .8, vy: Math.sin(a) * .8 - .4, t: 0, life: 35, ph: 0, sz: 1, col: '#ffe27a' }); }
    if (inPlay) sfx('bonus');
  } else if (f.type === 'text') {
    texts.push({ x: f.x * S + 1, y: f.y * S - 2, text: f.text, col: f.col || '#fff', t: 0 });
    if (inPlay && f.text.startsWith('goal')) sfx('goal');
    else if (inPlay && f.text.startsWith('core')) sfx('alert');
  }
}

// boot
buildTools(); updateMute(); fit(); demoSim(); drawTri(); updateTitle(); updateTools(); showScreen('title'); mode = 'title';
requestAnimationFrame(loop);
