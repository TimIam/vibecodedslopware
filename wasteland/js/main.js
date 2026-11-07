// Boot, game loop, input, sound and save. window.__wpc exposes hooks for headless testing.
import { B, N, DAY } from './data.js';
import * as W from './world.js';
import { Renderer, drawMinimap } from './render.js';
import { UI } from './ui.js';
import { buildingSprite } from './art.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const SAVE = 'wpc_v1';
const cv = $('view');
const R = new Renderer(cv);
const A = {
  G: null, R, ui: null, sid: 0, tool: 'inspect', speed: 1, flags: true, msvFrom: -1, simAcc: 0, running: false,
  setTool(t) {
    this.tool = t;
    R.ui.ghost = null; R.ui.roadPath = null; R.ui.drag = null; R.ui.msvTarget = null;
    R.ui.showOwn = t.startsWith('build:') || t === 'road' || t === 'clear';
    cv.style.cursor = t === 'inspect' ? 'default' : 'crosshair';
    this.ui && this.ui.markTools();
  },
  setSpeed(s) { this.speed = s; },
  nextTown() {
    const n = this.G.settlements.length;
    this.sid = (this.sid + 1) % n;
    const op = W.outpostOf(this.G, this.sid);
    if (op) R.centerOn(op.x + 1, op.y + 1);
    if (n > 1) this.ui.toast(`Viewing ${this.G.settlements[this.sid].name}`, 'good');
  },
  sfx(k) { sound(k); },
};

// ---------- sound: tiny square-wave blips ----------
let AC = null;
function sound(k) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const seq = { click: [[660, 0.04]], built: [[440, 0.06], [660, 0.08]], tech: [[523, 0.08], [659, 0.08], [784, 0.14]], alarm: [[220, 0.12], [180, 0.16]], boom: [[90, 0.2]], place: [[520, 0.05]], bad: [[160, 0.08]] }[k];
    if (!seq) return;
    let t = AC.currentTime;
    for (const [f, d] of seq) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
      t += d * 0.9;
    }
  } catch { /* no audio */ }
}

// ---------- save ----------
function saveGame() { try { if (A.G) localStorage.setItem(SAVE, W.save(A.G)); } catch { /* storage full or blocked */ } }
function loadGame() { try { const s = localStorage.getItem(SAVE); return s ? W.load(s) : null; } catch { return null; } }

function begin(G) {
  A.G = G; A.sid = 0; R.chunks.clear(); R.smoke = []; R.cars.clear();
  R.ui.sel = null; R.ui.tileSel = null;
  if (!A.ui) A.ui = new UI(A); else { A.ui.lastLog = G.log.length; A.ui.dismissed.clear(); }
  A.ui.lastLog = Math.max(0, G.log.length - 1);
  const op = W.outpostOf(G, 0);
  R.cam.z = window.innerWidth < 760 ? 1 : 2;
  R.bigBudget = true; // bake every visible ground chunk on the first frame
  R.centerOn(op.x + 1, op.y + 1);
  $('titleM').hidden = true;
  A.setTool('inspect');
  A.running = true;
}
$('newBtn').onclick = () => { sound('click'); begin(W.newGame(Q.has('seed') ? +Q.get('seed') : undefined)); saveGame(); };
$('contBtn').onclick = () => { const G = loadGame(); if (G) begin(G); };
$('restartBtn').onclick = () => { if (confirm('Dissolve the Commission and start over? Your town will be lost.')) { $('menuM').hidden = true; begin(W.newGame()); saveGame(); } };
$('saveBtn').onclick = () => { saveGame(); A.ui.toast('Minutes filed. Game saved.', 'good'); $('menuM').hidden = true; };
$('gridBtn').onclick = () => { R.grid = !R.grid; R.invalidateAll(); $('menuM').hidden = true; };
$('flagBtn').onclick = () => { A.flags = !A.flags; $('menuM').hidden = true; };
$('homeBtn').onclick = () => { const op = W.outpostOf(A.G, A.sid); if (op) R.centerOn(op.x + 1, op.y + 1); };
$('zoomIn').onclick = () => zoomAt(1, cv.clientWidth / 2, cv.clientHeight / 2);
$('zoomOut').onclick = () => zoomAt(-1, cv.clientWidth / 2, cv.clientHeight / 2);
setInterval(() => { if (A.running) saveGame(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden && A.running) saveGame(); });
window.addEventListener('pagehide', () => { if (A.running) saveGame(); });

// ---------- title art ----------
function titleArt() {
  const c = $('titleArt'), x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const g = x.createLinearGradient(0, 0, 0, 90);
  g.addColorStop(0, '#d89a5a'); g.addColorStop(0.55, '#8a5a3a'); g.addColorStop(0.56, '#6e5a3e'); g.addColorStop(1, '#4a3c2a');
  x.fillStyle = g; x.fillRect(0, 0, 320, 90);
  x.fillStyle = '#f2d27a'; x.beginPath(); x.arc(250, 40, 12, 0, 7); x.fill();
  const list = [['outpost', 0, false, 20, 78], ['farm', 0, false, 62, 86], ['home', 1, false, 120, 74], ['school', 1, false, 150, 84], ['tenement', 2, false, 200, 80], ['home', 2, true, 236, 76], ['windmill', 2, false, 272, 78], ['store', 2, true, 300, 88]];
  for (const [t, era, sd, px, py] of list) { const s = buildingSprite({ type: t, era, siding: sd, hue: (px / 10) | 0 }); x.drawImage(s.c, px - s.w / 2, py - s.h); }
}

// ---------- input ----------
const ptr = new Map();
let drag = null, pinch = null;
const tileAt = (px, py) => { const [gx, gy] = R.toGrid(px, py); return [Math.floor(gx), Math.floor(gy), gx, gy]; };
function zoomAt(dir, px, py) {
  const z0 = R.cam.z, z = Math.max(1, Math.min(4, z0 + dir));
  if (z === z0) return;
  const [, , X, Y] = R.toGrid(px, py);
  R.cam.z = z; R.resize();
  const [, , X2, Y2] = R.toGrid(px, py);
  R.cam.x += X - X2; R.cam.y += Y - Y2;
}
function clampCam() { R.cam.x = Math.max(-N * 16, Math.min(N * 16, R.cam.x)); R.cam.y = Math.max(-64, Math.min(N * 16 + 64, R.cam.y)); }
function rel(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(e.deltaY < 0 ? 1 : -1, x, y); }, { passive: false });
cv.addEventListener('pointerdown', (e) => {
  if (!A.running) return;
  cv.setPointerCapture(e.pointerId);
  const [x, y] = rel(e);
  ptr.set(e.pointerId, [x, y]);
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: R.cam.z }; drag = null; return; }
  const [tx, ty] = tileAt(x, y);
  const pan = e.button === 1 || e.button === 2 || A.tool === 'inspect' || A.tool.startsWith('build:') || A.tool === 'msv' || A.tool === 'bulldoze';
  drag = { x, y, sx: x, sy: y, tx, ty, btn: e.button, pan, moved: false, cancel: e.button === 2 && A.tool === 'clear' };
  if (A.tool === 'clear' && (e.button === 0 || e.button === 2)) { drag.pan = false; R.ui.drag = { kind: 'clear', rect: [tx, ty, tx, ty], cancel: drag.cancel }; }
  if (A.tool === 'road' && e.button === 0) { drag.pan = false; R.ui.roadPath = roadLine(tx, ty, tx, ty); }
});
cv.addEventListener('pointermove', (e) => {
  const [x, y] = rel(e);
  if (ptr.has(e.pointerId)) ptr.set(e.pointerId, [x, y]);
  if (pinch && ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const z = Math.max(1, Math.min(4, Math.round(pinch.z * (d / pinch.d))));
    if (z !== R.cam.z) zoomAt(z - R.cam.z, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    return;
  }
  if (!A.running) return;
  const [tx, ty, gx, gy] = tileAt(x, y);
  R.ui.hover = [tx, ty];
  if (drag) {
    if (Math.hypot(x - drag.sx, y - drag.sy) > 6) drag.moved = true;
    if (drag.pan && drag.moved) {
      const dpr = window.devicePixelRatio || 1;
      R.cam.x -= ((x - drag.x) * dpr) / R.scale; R.cam.y -= ((y - drag.y) * dpr) / R.scale; clampCam();
    }
    if (R.ui.drag) R.ui.drag.rect = [drag.tx, drag.ty, tx, ty];
    if (A.tool === 'road' && !drag.pan) R.ui.roadPath = roadLine(drag.tx, drag.ty, tx, ty);
    drag.x = x; drag.y = y;
  }
  const G = A.G;
  if (A.tool.startsWith('build:')) {
    const type = A.tool.slice(6), [w, d] = B[type].size;
    const bx = Math.round(gx - w / 2), by = Math.round(gy - d / 2);
    const r = W.canPlace(G, type, bx, by);
    R.ui.ghost = { type, x: bx, y: by, w, d, ok: r.ok, reason: r.reason, era: W.eraNow(G), siding: r.sid != null ? W.sidingNow(G, G.settlements[r.sid]) : false };
  } else if (A.tool === 'msv') {
    const r = W.canDispatch(G, A.msvFrom, tx, ty);
    R.ui.msvTarget = { x: tx, y: ty, ok: r.ok, reason: r.reason };
  }
});
function endPtr(e) {
  ptr.delete(e.pointerId);
  if (pinch) { if (ptr.size < 2) pinch = null; drag = null; return; }
  if (!drag || !A.running) return;
  const d = drag; drag = null;
  const [x, y] = rel(e), [tx, ty, gx, gy] = tileAt(x, y);
  const G = A.G;
  if (d.btn === 2 && !d.moved && A.tool !== 'clear') { A.setTool('inspect'); return; }
  if (A.tool === 'clear') {
    const [x0, y0] = [d.tx, d.ty];
    const r = d.cancel ? W.cancelClear(G, x0, y0, tx, ty) : W.queueClear(G, x0, y0, tx, ty);
    R.ui.drag = null;
    if (d.cancel) { if (r.n) A.ui.toast(`Cancelled ${r.n} clearing orders.`, 'warn'); }
    else if (r.ok) { sound('place'); A.ui.toast(`${r.n} tile${r.n > 1 ? 's' : ''} marked for clearing.`, 'good'); }
    else A.ui.toast(r.reason, 'warn');
    return;
  }
  if (A.tool === 'road' && !d.pan) {
    const path = R.ui.roadPath || []; R.ui.roadPath = null;
    let n = 0, why = '';
    for (const [px, py] of path) { const r = W.placeRoad(G, px, py); if (r.ok) n++; else if (r.reason && r.reason !== 'Already a road') why = r.reason; }
    if (n) sound('place');
    if (why && !n) A.ui.toast(why, 'warn'); else if (why) A.ui.toast(`Paved ${n}. Stopped: ${why}`, 'warn');
    return;
  }
  if (d.moved) return;
  if (A.tool === 'inspect') {
    const b = R.pick(G, x, y);
    if (b) { R.ui.sel = b.id; R.ui.tileSel = null; A.sid = b.sid; sound('click'); }
    else { R.ui.sel = null; R.ui.tileSel = [tx, ty]; if (W.inb(tx, ty) && G.own[W.I(tx, ty)] >= 0) A.sid = G.own[W.I(tx, ty)]; }
  } else if (A.tool.startsWith('build:')) {
    const type = A.tool.slice(6), [w, dd] = B[type].size;
    const r = W.placeBuilding(G, type, Math.round(gx - w / 2), Math.round(gy - dd / 2));
    if (r.ok) { sound('place'); A.sid = r.b.sid; } else { sound('bad'); A.ui.toast(r.reason, 'warn'); }
  } else if (A.tool === 'bulldoze') {
    const b = R.pick(G, x, y);
    if (b) {
      if (b.type === 'outpost') { A.ui.toast('The Commission does not demolish itself.', 'warn'); return; }
      if (b.built && !confirm(`Demolish this ${B[b.type].name}? You get 30% of its materials back.`)) return;
      const r = W.demolish(G, b.id); if (r.ok) { sound('boom'); if (R.ui.sel === b.id) R.ui.sel = null; }
    } else if (W.demolishRoad(G, tx, ty).ok) sound('boom');
    else if (W.cancelClear(G, tx, ty, tx, ty).n) sound('click');
  } else if (A.tool === 'msv') {
    const r = W.dispatchMSV(G, A.msvFrom, tx, ty);
    if (r.ok) { sound('tech'); A.setTool('inspect'); } else A.ui.toast(r.reason, 'warn');
  }
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { R.ui.hover = null; });
function roadLine(x0, y0, x1, y1) {
  const out = [], G = A.G;
  const horizFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const push = (x, y) => { if (!out.some(([a, b]) => a === x && b === y)) out.push([x, y, W.inb(x, y) && (G.road[W.I(x, y)] || W.canRoad(G, x, y).ok)]); };
  if (horizFirst) { for (let x = x0; x !== x1 + Math.sign(x1 - x0 || 1); x += Math.sign(x1 - x0 || 1)) push(x, y0); for (let y = y0; y !== y1 + Math.sign(y1 - y0 || 1); y += Math.sign(y1 - y0 || 1)) push(x1, y); }
  else { for (let y = y0; y !== y1 + Math.sign(y1 - y0 || 1); y += Math.sign(y1 - y0 || 1)) push(x0, y); for (let x = x0; x !== x1 + Math.sign(x1 - x0 || 1); x += Math.sign(x1 - x0 || 1)) push(x, y1); }
  return out;
}
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    for (const id of ['treeM', 'charterM', 'menuM', 'winM']) if (!$(id).hidden) { $(id).hidden = true; return; }
    if (A.tool !== 'inspect') A.setTool('inspect'); else { R.ui.sel = null; R.ui.tileSel = null; $('fly').hidden = true; A.ui.setActiveCat(null); }
    return;
  }
  if (!A.running) return;
  keys.add(k);
  if (k === ' ') { e.preventDefault(); A.speed = A.speed ? 0 : 1; }
  else if (k === '1') A.speed = 1; else if (k === '2') A.speed = 2; else if (k === '3') A.speed = 4;
  else if (k === 'c') A.setTool('clear'); else if (k === 'r') A.setTool('road'); else if (k === 'b') A.setTool('bulldoze');
  else if (k === 't') A.ui.openTree(); else if (k === 'k') A.ui.openCharter();
  else if (k === 'g') { R.grid = !R.grid; R.invalidateAll(); }
  else if (k === 'h') $('homeBtn').onclick();
  else if (k === '+' || k === '=') zoomAt(1, cv.clientWidth / 2, cv.clientHeight / 2);
  else if (k === '-' || k === '_') zoomAt(-1, cv.clientWidth / 2, cv.clientHeight / 2);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
$('mm').addEventListener('pointerdown', (e) => {
  const mm = $('mm'), r = mm.getBoundingClientRect();
  const go = (ev) => { const mx = ((ev.clientX - r.left) / r.width) * 256, my = ((ev.clientY - r.top) / r.height) * 128; R.cam.x = (mx - N) * 16; R.cam.y = my * 16; };
  go(e);
  const mv = (ev) => go(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
});

// ---------- loop ----------
let last = performance.now(), uiT = 0, mmT = 0;
const SIM = 0.1, SPEED = Q.has('speed') ? +Q.get('speed') : null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (A.running) {
    const G = A.G;
    const pan = 360 * dt / R.cam.z * (keys.has('shift') ? 2 : 1);
    if (keys.has('a') || keys.has('arrowleft')) R.cam.x -= pan;
    if (keys.has('d') || keys.has('arrowright')) R.cam.x += pan;
    if (keys.has('w') || keys.has('arrowup')) R.cam.y -= pan;
    if (keys.has('s') || keys.has('arrowdown')) R.cam.y += pan;
    clampCam();
    A.simAcc += dt * (SPEED != null ? SPEED : A.speed);
    let n = 0;
    while (A.simAcc >= SIM && n < 60) { W.step(G, SIM); A.simAcc -= SIM; n++; }
    if (n >= 60) A.simAcc = 0;
    R.ui.sid = A.sid;
    R.draw(G, dt, { flags: A.flags });
    if ((mmT += dt) > 0.2) { mmT = 0; drawMinimap(G, $('mm'), R, A.sid); }
    if ((uiT += dt) > 0.25) { uiT = 0; A.ui.update(); }
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
titleArt();
if (Q.has('reset')) try { localStorage.removeItem(SAVE); } catch { /* */ }
$('contBtn').hidden = !(() => { try { return localStorage.getItem(SAVE); } catch { return null; } })();
if (Q.has('skip')) begin(W.newGame(Q.has('seed') ? +Q.get('seed') : 1234));
requestAnimationFrame(frame);

window.__wpc = {
  get G() { return A.G; }, A, R, W,
  step(n = 10) { for (let i = 0; i < n; i++) W.step(A.G, SIM); },
  dev() { return W.dev(A.G); },
  center(x, y) { R.centerOn(x, y); },
  zoom(z) { R.cam.z = z; },
  draw() { R.bigBudget = true; R.draw(A.G, 0.016, { flags: A.flags }); drawMinimap(A.G, $('mm'), R, A.sid); A.ui.update(); },
  begin(seed) { begin(W.newGame(seed)); },
  loadJSON(str) { begin(W.load(str)); },
  perf(n = 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { W.step(A.G, SIM); } const t1 = performance.now(); for (let i = 0; i < 20; i++) R.draw(A.G, 0.016, { flags: true }); return { simMsPerStep: (t1 - t0) / n, drawMs: (performance.now() - t1) / 20, units: A.G.units.length }; },
  DAY,
};
