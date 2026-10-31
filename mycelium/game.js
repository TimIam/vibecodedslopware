// Mycelium: rendering, input, garden map, save. The simulation itself is in sim.js.
import { Sim, W, H, AIR, SOIL, CLAY, ROCK, WATER, FOOD, TPS, DAY, PLOT_KINDS, mulberry } from './sim.js';

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
function distances() { // BFS over claimable plots from START
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
  day: $('#day'), weather: $('#weather'), plotName: $('#plotName'), log: $('#log'), pct: $('#pct'), toolAttract: $('#toolAttract'), toolErase: $('#toolErase'),
  pause: $('#pause'), speed: [...document.querySelectorAll('[data-speed]')], shroomsN: $('#shroomsN'), hint: $('#hint'), coreHp: $('#coreHp'),
};

let sim = null, plotIndex = START, mode = 'title', speed = 1, paused = false, erase = false, frame = 0, acc = 0, last = 0;
let hover = null, painting = false;
let particles = [], rain = [], clouds = [], stars = [];
let shakeT = 0;

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

// ---------- start / screens ----------
function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('open', s.id === name);
  mode = name === 'none' ? 'play' : name;
  document.body.classList.toggle('playing', name === 'none');
}

function startPlot(i) {
  plotIndex = i;
  const kind = plotKind(i);
  sim = new Sim((garden.seed + i * 7919 + garden.plays * 131) >>> 0, kind, DIST[i]);
  garden.plays++; saveGarden();
  makeNoise(sim.seed);
  particles = []; rain = []; shakeT = 0;
  clouds = []; for (let k = 0; k < 5; k++) clouds.push({ x: Math.random() * PW, y: 4 + Math.random() * 16, w: 14 + Math.random() * 26, v: .05 + Math.random() * .12 });
  stars = []; const r = mulberry(sim.seed); for (let k = 0; k < 40; k++) stars.push({ x: Math.floor(r() * PW), y: Math.floor(r() * 30), p: r() * 6.28 });
  speed = 1; paused = false; erase = false;
  sim.say(`${PLOT_KINDS[kind].name}. ${PLOT_KINDS[kind].desc}`);
  sim.say('Paint attractant (click/drag in the soil) to steer your hyphae toward food.');
  el.plotName.textContent = PLOT_KINDS[kind].name;
  updateTools(); drawTri();
  showScreen('none');
}

function demoSim() {
  sim = new Sim((Math.random() * 1e9) >>> 0, 'lawn', 1);
  sim.alloc[0] = { grow: .6, def: .25, fruit: .15 };
  makeNoise(sim.seed);
  clouds = []; for (let k = 0; k < 5; k++) clouds.push({ x: Math.random() * PW, y: 4 + Math.random() * 16, w: 14 + Math.random() * 26, v: .05 + Math.random() * .12 });
  stars = []; for (let k = 0; k < 40; k++) stars.push({ x: Math.floor(Math.random() * PW), y: Math.floor(Math.random() * 30), p: Math.random() * 6.28 });
  particles = []; rain = [];
  // the demo colony steers itself toward food
  sim.demo = true;
}

// ---------- rendering ----------
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
      if (cy === sim.sy[cx] - 1) { // grass
        const row = (by + 2) * PW + bx;
        const g1 = rgb(58, 108, 40), g2 = rgb(88, 148, 52);
        px[row] = g1; px[row + 1] = g1; px[row + 2] = g1;
        const tuft = (cx * 7 + 3) % 5;
        if (tuft < 2) px[(by + 1) * PW + bx + tuft] = g2;
        if (tuft === 3) { px[(by + 1) * PW + bx + 1] = g2; px[(by) * PW + bx + 1] = g1; }
      }
      continue;
    }
    // base soil colour per cell
    let r, g, b;
    const m = M[i];
    if (t === ROCK) { r = 98; g = 98; b = 104; }
    else if (t === WATER) { const sh = Math.sin(sim.time * .08 + cx * .9 + cy) * 12; r = 44; g = 96 + sh; b = 170 + sh; }
    else {
      if (t === CLAY) { r = 118; g = 72; b = 54; } else { r = 78; g = 56; b = 40; }
      if (t === FOOD) { const f = Math.min(1, F[i] / 80); r = lerp(r, 152, f); g = lerp(g, 100, f); b = lerp(b, 42, f); }
      if (sim.dist[i]) { r += 18; g += 14; b += 10; }
      const dark = 1 - .38 * m;
      r *= dark; g *= dark; b = b * dark + m * 12;
      // toxins stain the soil
      const a = tx0[i], c2 = tx1[i];
      if (a > .04) { const k = Math.min(.5, a * .5); r = lerp(r, 140, k); g = lerp(g, 80, k); b = lerp(b, 190, k); }
      if (c2 > .04) { const k = Math.min(.5, c2 * .5); r = lerp(r, 160, k); g = lerp(g, 170, k); b = lerp(b, 50, k); }
    }
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const pi = (by + dy) * PW + bx + dx;
      let n = noise[pi] * (t === ROCK ? 22 : t === WATER ? 6 : 26);
      if (t === ROCK) { if (dx === 0 && dy === 0) n += 30; if (dx === 2 && dy === 2) n -= 26; }
      if (t === FOOD && ((dx + dy + cx) % 3 === 0)) n -= 28;
      px[pi] = rgb(clamp8(r + n), clamp8(g + n), clamp8(b + n));
    }
    // attractant: dotted cyan
    const s = sc[i];
    if (s > .04 && ((cx + cy + (frame >> 3)) & 1)) {
      const k = Math.min(1, s * 1.2);
      const pi = (by + 1) * PW + bx + 1;
      px[pi] = rgb(clamp8(lerp(r, 90, k)), clamp8(lerp(g, 225, k)), clamp8(lerp(b, 235, k)));
    }
  }
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
      if (d > .72) { // cords: thicker, brighter
        const cc = rgb(Math.min(255, c[0] + 12), Math.min(255, c[1] + 12), Math.min(255, c[2] + 12));
        px[(by + 1) * PW + bx] = cc; px[(by + 1) * PW + bx + 2] = cc; px[by * PW + bx + 1] = cc; px[(by + 2) * PW + bx + 1] = cc;
      }
    }
  }
  // stars
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
  // clouds
  for (const c of clouds) {
    c.x += c.v * (w === 'storm' ? 3 : 1); if (c.x > PW + 40) c.x = -40;
    ctx.fillStyle = gray > .4 ? 'rgba(120,124,135,.9)' : night ? 'rgba(90,96,120,.8)' : 'rgba(255,255,255,.9)';
    const x = Math.round(c.x), y = Math.round(c.y), ww = Math.round(c.w);
    ctx.fillRect(x, y + 3, ww, 3); ctx.fillRect(x + 3, y, ww - 8, 3); ctx.fillRect(x + 6, y - 2, Math.max(4, ww - 16), 2);
  }
  // rain
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

  // mushrooms (behind grubs)
  for (const m of sim.shrooms) drawShroom(m);
  // grubs
  for (const g of sim.grubs) drawGrub(g);
  // tips
  for (let s = 0; s < 2; s++) {
    ctx.fillStyle = s ? '#ffd090' : '#ffffff';
    for (const t of sim.tips[s]) ctx.fillRect(Math.round(t.x) * S + 1, Math.round(t.y) * S + 1, 1, 1);
  }
  // cores
  for (let s = 0; s < 2; s++) {
    const c = sim.core[s], pulse = (Math.sin(frame * .08) + 1) / 2;
    ctx.fillStyle = s ? `rgba(255,170,90,${.35 + .4 * pulse})` : `rgba(255,255,230,${.35 + .4 * pulse})`;
    const x = c.x * S - 2, y = c.y * S - 2;
    ctx.fillRect(x, y, 7, 1); ctx.fillRect(x, y + 6, 7, 1); ctx.fillRect(x, y, 1, 7); ctx.fillRect(x + 6, y, 1, 7);
  }
  // spade
  if (sim.spade) drawSpade(sim.spade);
  // particles
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k]; p.t++;
    p.x += p.vx + Math.sin(p.t * .1 + p.ph) * .15; p.y += p.vy; p.vy *= .99;
    if (p.t > p.life) { particles.splice(k, 1); continue; }
    ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, (p.life - p.t) / 30);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
  // hover brush
  if (hover && mode === 'play') {
    ctx.strokeStyle = erase ? 'rgba(255,120,120,.8)' : 'rgba(120,240,240,.8)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hover.x * S + 1.5, hover.y * S + 1.5, 5 * S, 0, 6.283); ctx.stroke();
    ctx.fillStyle = erase ? '#ff8080' : '#80f0f0'; ctx.fillRect(hover.x * S + 1, hover.y * S + 1, 1, 1);
  }
  // night shade on soil (subtle)
  if (night) { ctx.fillStyle = 'rgba(10,10,30,.18)'; ctx.fillRect(0, 0, PW, PH); }
}
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const skyCss = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function blockyDisc(cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let y = -r; y <= r; y++) { const hw = Math.round(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); }
}
const CAPS = [[['#c99a52', '#f1e2bd'], ['#c93c3a', '#fff1e4'], ['#8a5a3a', '#d9b48a']], [['#e87a2e', '#ffd0a0'], ['#d85a1e', '#ffc080'], ['#f0963c', '#ffe0b0']]];
function drawShroom(m) {
  const gx = m.x * S + 1, gy = sim.sy[m.x] * S;      // ground pixel
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
  if (capH > 1) { ctx.fillStyle = wilt ? '#777' : spot; ctx.fillRect(cx + 1, cy + 1, 1, 1); if (capW > 5) ctx.fillRect(cx + capW - 3, cy + 2, 1, 1); if (capW > 8) ctx.fillRect(cx + (capW >> 1), cy + 1, 1, 1); }
  if (m.phase === 1 && !m.side) { ctx.fillStyle = `rgba(255,255,255,${.25 + .25 * Math.sin(frame * .2)})`; ctx.fillRect(cx, cy + capH + 1, capW, 1); }
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const r = clamp8((n >> 16) + d), g = clamp8(((n >> 8) & 255) + d), b = clamp8((n & 255) + d); return `rgb(${r},${g},${b})`; }
function drawGrub(g) {
  const x = Math.round(g.x) * S + 1, y = Math.round(g.y) * S + 1, f = Math.floor(g.t / 6) % 2, dir = Math.cos(g.a) >= 0 ? 1 : -1;
  ctx.fillStyle = g.hurt ? '#ff9a7a' : '#ece0c4';
  ctx.fillRect(x - 3 * dir - (dir < 0 ? 0 : 0), y - 1 + f, 3, 3); ctx.fillRect(x - 6 * dir + (dir > 0 ? 0 : 3), y - 1 + (1 - f), 3, 3);
  ctx.fillStyle = '#7a5030'; ctx.fillRect(x + (dir > 0 ? 0 : -2), y - 1, 3, 3);
  ctx.fillStyle = '#201008'; ctx.fillRect(x + (dir > 0 ? 2 : -2), y - 1, 1, 1);
}
function drawSpade(sp) {
  const x = sp.x * S + 1, gy = sim.sy[sp.x] * S;
  const f = sp.t < sp.dur ? sp.t / sp.dur : Math.max(0, 1 - (sp.t - sp.dur) / 40);
  const y = -40 + (gy + 90 + 40) * f * f;
  const bladeTop = Math.min(y, gy + 90);
  if (sp.t === sp.dur) shakeT = 12;
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x - 10, bladeTop - 30, 21, 30);
  ctx.fillStyle = '#c8ced6'; ctx.fillRect(x - 9, bladeTop - 29, 3, 28);
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 2, bladeTop - 130, 5, 100);
  ctx.fillStyle = '#4a2a16'; ctx.fillRect(x - 8, bladeTop - 134, 17, 6);
}

// ---------- allocation triangle ----------
const TRI = { ax: 60, ay: 8, bx: 8, by: 96, cx: 112, cy: 96 }; // grow top, defend left, fruit right
function drawTri() {
  const a = sim ? sim.alloc[0] : { grow: .6, def: .2, fruit: .2 };
  const c = tctx; c.clearRect(0, 0, tri.width, tri.height);
  c.fillStyle = '#1a2a22'; c.beginPath(); c.moveTo(TRI.ax, TRI.ay); c.lineTo(TRI.bx, TRI.by); c.lineTo(TRI.cx, TRI.cy); c.closePath(); c.fill();
  c.strokeStyle = '#6f9b7a'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(111,155,122,.25)'; c.lineWidth = 1;
  for (const [p, q] of [[TRI, 'a'], [TRI, 'b'], [TRI, 'c']]) { void p; void q; }
  c.beginPath(); c.moveTo(TRI.ax, TRI.ay); c.lineTo((TRI.bx + TRI.cx) / 2, TRI.by); c.moveTo(TRI.bx, TRI.by); c.lineTo((TRI.ax + TRI.cx) / 2, (TRI.ay + TRI.cy) / 2); c.moveTo(TRI.cx, TRI.cy); c.lineTo((TRI.ax + TRI.bx) / 2, (TRI.ay + TRI.by) / 2); c.stroke();
  const x = a.grow * TRI.ax + a.def * TRI.bx + a.fruit * TRI.cx, y = a.grow * TRI.ay + a.def * TRI.by + a.fruit * TRI.cy;
  c.fillStyle = '#f3efe2'; c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); c.fillStyle = '#19221e'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  el.pct.textContent = `grow ${Math.round(a.grow * 100)}%  ·  defend ${Math.round(a.def * 100)}%  ·  fruit ${Math.round(a.fruit * 100)}%`;
}
function triPick(ev) {
  const r = tri.getBoundingClientRect();
  const x = (ev.clientX - r.left) * tri.width / r.width, y = (ev.clientY - r.top) * tri.height / r.height;
  // barycentric
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
for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => { const [g, d, f] = b.dataset.preset.split(',').map(Number); if (sim) sim.setAlloc(g, d, f); drawTri(); });

// ---------- world input ----------
function cellFromEvent(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return { x, y };
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  const c = cellFromEvent(e); if (!c) return;
  painting = true; cv.setPointerCapture(e.pointerId);
  const er = erase || e.button === 2 || e.shiftKey;
  sim.paint(c.x, c.y, er, 1); hover = c; lastPaint = c;
});
let lastPaint = null;
cv.addEventListener('pointermove', e => {
  const c = cellFromEvent(e); hover = c;
  if (!painting || !c || mode !== 'play') return;
  const er = erase || (e.buttons & 2) || e.shiftKey;
  // interpolate so fast drags leave a continuous trail
  if (lastPaint) { const n = Math.max(1, Math.hypot(c.x - lastPaint.x, c.y - lastPaint.y)); for (let k = 1; k <= n; k++) sim.paint(Math.round(lerp(lastPaint.x, c.x, k / n)), Math.round(lerp(lastPaint.y, c.y, k / n)), er, .35); }
  else sim.paint(c.x, c.y, er, .5);
  lastPaint = c;
});
const stopPaint = () => { painting = false; lastPaint = null; };
cv.addEventListener('pointerup', stopPaint); cv.addEventListener('pointercancel', stopPaint);
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());

function updateTools() {
  el.toolAttract.classList.toggle('on', !erase); el.toolErase.classList.toggle('on', erase);
  el.pause.textContent = paused ? '▶ resume' : '❚❚ pause'; el.pause.classList.toggle('on', paused);
  for (const b of el.speed) b.classList.toggle('on', Number(b.dataset.speed) === speed);
}
el.toolAttract.addEventListener('click', () => { erase = false; updateTools(); });
el.toolErase.addEventListener('click', () => { erase = true; updateTools(); });
el.pause.addEventListener('click', () => { paused = !paused; updateTools(); });
for (const b of el.speed) b.addEventListener('click', () => { speed = Number(b.dataset.speed); paused = false; updateTools(); });
$('#helpBtn').addEventListener('click', () => openHelp());
$('#gardenBtn').addEventListener('click', () => { if (confirm('Abandon this plot and return to the garden? Spores already shed are kept.')) endPlot(false); });
window.addEventListener('keydown', e => {
  if (e.target.closest('input,button,select,textarea')) return;
  if (mode === 'help') { if (e.key === 'Escape' || e.key === 'h' || e.key === 'H') closeHelp(); return; }
  if (mode !== 'play') return;
  if (e.code === 'Space') { e.preventDefault(); paused = !paused; }
  else if (e.key === '1' || e.key === '2' || e.key === '3') { speed = Number(e.key); paused = false; }
  else if (e.key === 'e' || e.key === 'E') erase = !erase;
  else if (e.key === 'h' || e.key === 'H' || e.key === '?') openHelp();
  else if (e.key === 'q' || e.key === 'Q') for (const b of document.querySelectorAll('[data-preset]')) if (b.dataset.key === 'q') b.click();
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
  el.grubs.textContent = sim.grubs.length; el.coreHp.textContent = '♥'.repeat(sim.coreHp[0]) + '♡'.repeat(5 - sim.coreHp[0]);
  el.day.textContent = `Day ${sim.day}`;
  el.weather.textContent = { sun: '☀ sunny', cloud: '☁ overcast', rain: '🌧 rain', storm: '⛈ storm' }[sim.weather];
  const items = sim.log.slice(-6).reverse();
  el.log.innerHTML = items.map((l, k) => `<div class="${k === 0 && sim.time - l.t < 90 ? 'fresh' : ''}">${l.msg}</div>`).join('');
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
  const r = $('#result');
  r.querySelector('h2').textContent = won ? (garden.won ? 'The garden is yours.' : 'Plot claimed!') : fromSim ? 'The colony withered.' : 'Plot abandoned.';
  const why = won ? (sim.result === 'rival' ? 'The rival colony has been consumed. Your network owns this soil.' : 'Your spores have saturated this patch. Whatever grows here now, grows from you.')
    : fromSim ? (sim.result === 'consumed' ? 'The rival ate its way to your core. What is left of you is now part of it.' : 'Starved and cut off, the last threads dissolved into the soil.') : 'Your hyphae here will fade, but the spores you shed are already in the air.';
  r.querySelector('p.why').textContent = why;
  r.querySelector('p.shed').innerHTML = `<b>${shed}</b> spores shed on this plot · spore bank now <b>${garden.bank}</b>`;
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
      startPlot(i);
    });
    grid.appendChild(b);
  }
  $('#gardenNote').textContent = garden.won ? 'The whole garden is yours. Plots can be replayed for the joy of it.'
    : anyHeld ? 'Spend spores to drift onto a plot next to one you hold. Replaying a held plot sheds more spores.'
      : 'Start in the bottom-left corner. Win a plot by out-growing the rival or by shedding enough spores there.';
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
$('#playBtn').addEventListener('click', () => { if (!garden) newGarden(); openGarden(); });
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
  // the title-screen colony paints its own attractant toward the richest smell
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
  if (sim) {
    const running = mode === 'play' ? !paused : mode === 'title' || mode === 'help' && helpReturn === 'title';
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
function spawnFx(f) {
  if (f.type === 'spore') {
    for (let k = 0; k < 3; k++) particles.push({ x: f.x * S + 1 + (Math.random() - .5) * 6, y: f.y * S - f.size - 2, vx: .15 + Math.random() * .35, vy: -.3 - Math.random() * .4, t: 0, life: 80 + Math.random() * 60, ph: Math.random() * 6, sz: 1, col: f.side ? '#ffc890' : '#fffbe8' });
  } else if (f.type === 'grubdeath') {
    for (let k = 0; k < 14; k++) particles.push({ x: f.x * S + 1, y: f.y * S + 1, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, t: 0, life: 25 + Math.random() * 20, ph: 0, sz: 2, col: k % 3 ? '#ece0c4' : '#c08060' });
  } else if (f.type === 'dig') {
    for (let k = 0; k < 40; k++) particles.push({ x: f.x * S + (Math.random() - .5) * 24, y: f.y * S, vx: (Math.random() - .5) * 3, vy: -1 - Math.random() * 3, t: 0, life: 30 + Math.random() * 30, ph: 0, sz: 2, col: k % 4 ? '#6a4a30' : '#3f8a35' });
  }
}

// boot
fit(); demoSim(); drawTri(); updateTitle(); updateTools(); showScreen('title'); mode = 'title';
requestAnimationFrame(loop);
