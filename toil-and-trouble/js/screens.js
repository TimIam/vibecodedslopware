// screens.js — title, world map, level card, results, game over and the ending. Pure drawing + tiny state.
import { W, H } from './world.js';
import { Painter, ramp, hex, css, drawText, textWidth, fbm, hash2, vnoise, BAYER4 } from './pix.js';
import * as S from './sprites.js';
import * as S_ from './sprites.js';
import { spr } from './render.js';
import { label } from './input.js';

const R = (h, n = 6) => ramp(h, n);
let titleBg = null, mapBg = null;

// ---------------------------------------------------------------------------------------------------------------
// title
function paintTitleBg() {
  const P = new Painter(W, H);
  const sky = [hex('#0c0818'), hex('#1a1034'), hex('#2e1a4e'), hex('#5a2a5e'), hex('#9a3e5a'), hex('#e07a4a')];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.min(1, Math.max(0, (y - 10) / 170));
    const v = t * (sky.length - 1), i = Math.floor(v), f = v - i;
    P.set(x, y, sky[Math.min(sky.length - 1, f > BAYER4[(y & 3) * 4 + (x & 3)] ? i + 1 : i)]);
  }
  // stars
  for (let i = 0; i < 90; i++) { const x = Math.floor(hash2(i, 1) * W), y = Math.floor(hash2(i, 2) * 110); P.set(x, y, hash2(i, 3) > 0.8 ? hex('#fff6d0') : hex('#a8a0d0')); }
  // moon
  P.ellipse(300, 50, 26, 26, R('#f4ecc8'), { flat: 0.95 });
  for (const [x, y, r] of [[292, 44, 5], [308, 58, 4], [300, 36, 3], [314, 46, 2.5]]) P.ellipse(x, y, r, r, R('#e0d4a8'), { flat: 0.7 });
  // far hills
  const hill = (base, amp, fr, col, s) => { for (let x = 0; x < W; x++) { const hgt = base - (fbm(x / fr, 0, s, 3) - 0.5) * amp * 2 - Math.sin(x / 40 + s) * amp * 0.3; for (let y = Math.floor(hgt); y < H; y++) P.set(x, y, col); } };
  hill(150, 22, 60, hex('#3a2048'), 3);
  hill(168, 18, 40, hex('#24142e'), 7);
  // conifers on the near hill
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash2(i, 9) * W), base = 172 + hash2(i, 8) * 12, h = 18 + hash2(i, 7) * 22;
    for (let y = 0; y < h; y++) { const w = Math.floor((y / h) * 7 + 1); for (let k = -w; k <= w; k++) P.set(x + k, Math.floor(base - h + y), hex('#160c1c')); }
  }
  for (let y = 186; y < H; y++) for (let x = 0; x < W; x++) P.set(x, y, hex('#120a16'));
  return P.toCanvas();
}

export function drawTitle(ctx, t, opts = {}) {
  if (!titleBg) titleBg = paintTitleBg();
  ctx.drawImage(titleBg, 0, 0);
  // twinkles
  for (let i = 0; i < 12; i++) { if (((t * 3 + i * 7) | 0) % 9 === 0) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(Math.floor(hash2(i, 11) * W), Math.floor(hash2(i, 12) * 100), 1, 1); } }
  // cauldron + fire
  const cx = W / 2, cy = 192;
  for (let i = 0; i < 14; i++) {
    const h = 6 + ((i * 7 + Math.floor(t * 12)) % 7);
    for (let k = 0; k < h; k++) { ctx.fillStyle = k < 2 ? '#c8301a' : k < h - 3 ? '#ff7a2a' : '#ffd060'; ctx.fillRect(cx - 14 + i * 2, cy - k, 2, 1); }
  }
  spr(ctx, S.goalSprite(Math.floor(t * 8)), cx, cy - 2, 24, 38);
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(cx, cy - 10, 2, cx, cy - 10, 70);
  gr.addColorStop(0, 'rgba(255,140,60,0.35)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = gr; ctx.fillRect(cx - 70, cy - 80, 140, 100);
  ctx.globalCompositeOperation = 'source-over';
  // steam
  for (let i = 0; i < 8; i++) {
    const k = ((t * 0.4 + i / 8) % 1);
    const x = cx - 10 + Math.sin(i * 2 + t) * 8 + i * 2.5, y = cy - 28 - k * 60;
    ctx.fillStyle = `rgba(200,240,190,${0.35 * (1 - k)})`;
    const r = 2 + k * 6; ctx.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.round(r), Math.round(r));
  }
  // the coven
  spr(ctx, S.witchSprite('mags', Math.floor(t * 2) % 4 === 0 ? 'victory' : 'idle', Math.floor(t * 3)), cx - 40, cy, 28, 50, 1);
  spr(ctx, S.witchSprite('pip', Math.floor(t * 2 + 1) % 4 === 0 ? 'victory' : 'idle', Math.floor(t * 3)), cx + 38, cy, 28, 50, -1);
  // logo
  const drop = Math.min(1, t / 1.2);
  const ly = Math.round(-40 + drop * 74 + (drop >= 1 ? Math.sin(t * 2) * 1.5 : 0));
  logo(ctx, W / 2, ly, t);
  drawText(ctx, 'A WITCHES AND CAULDRONS PLATFORMER', W / 2, ly + 40, '#d8c8f0', { align: 'center', outline: true });
  if (t > 1.3 && Math.floor(t * 2) % 2 === 0) drawText(ctx, opts.prompt || 'PRESS START', W / 2, 150, '#fff6c8', { align: 'center', outline: true });
  if (opts.hint) drawText(ctx, opts.hint, W / 2, 206, '#8a7aa8', { align: 'center', shadow: null });
}
function logo(ctx, x, y, t) {
  const s = 'TOIL & TROUBLE', scale = 4;
  const w = textWidth(s, scale);
  // dripping ooze under letters
  const x0 = Math.round(x - w / 2);
  drawText(ctx, s, x, y + 2, '#0c0610', { align: 'center', scale, shadow: null });
  drawText(ctx, s, x, y, '#8cf05a', { align: 'center', scale, outline: true, grad: ['#e8ff9a', '#8cf05a', '#3a9a3a'] });
  for (let i = 0; i < 9; i++) {
    const dx = x0 + Math.floor(hash2(i, 5) * w);
    const len = 2 + ((Math.floor(t * 3) + i * 3) % 7);
    ctx.fillStyle = '#3a9a3a'; ctx.fillRect(dx, y + 28, 2, len);
    ctx.fillStyle = '#8cf05a'; ctx.fillRect(dx, y + 28 + len, 2, 2);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// world select and the per-world maps
const WSTYLE = {
  hallo: { land: '#5a4a3a', grass: '#4a5a2a', sea: '#1e1a3a', sand: '#8a7a5a', accent: '#ff8a2a', icon: 'pumpkin' },
  july: { land: '#5a8a3a', grass: '#3a7a2e', sea: '#1e3a7a', sand: '#d8c890', accent: '#e84a4a', icon: 'rocket' },
  pat: { land: '#3ab050', grass: '#1e8a3a', sea: '#2a5a8a', sand: '#d8d0a0', accent: '#f0d040', icon: 'clover' },
  easter: { land: '#9ad880', grass: '#6ab86a', sea: '#7ab8e8', sand: '#f8e8c8', accent: '#ff9ad0', icon: 'egg' },
  val: { land: '#d88a9a', grass: '#b85a7a', sea: '#7a3a6a', sand: '#f8d8d0', accent: '#ff3a6a', icon: 'heart' },
  thanks: { land: '#c89a3a', grass: '#9a6a22', sea: '#3a4a6a', sand: '#e8c890', accent: '#ff6a2a', icon: 'leaf' },
  xmas: { land: '#e8f0ff', grass: '#b8c8e0', sea: '#2a3a6a', sand: '#c8d8f0', accent: '#d82a3a', icon: 'tree' },
};
function icon(ctx, kind, x, y, s = 1, col) {
  // tiny pixel emblem for a world
  x = Math.round(x); y = Math.round(y);
  const P = (dx, dy, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x + dx * s, y + dy * s, w * s, h * s); };
  switch (kind) {
    case 'pumpkin': P(-4, -3, '#e86a1a', 9, 7); P(-3, -4, '#e86a1a', 7, 9); P(0, -6, '#3a6a2a', 1, 2); P(-2, -1, '#ffe070', 1, 1); P(2, -1, '#ffe070', 1, 1); P(-2, 2, '#ffe070', 5, 1); break;
    case 'rocket': P(-1, -6, '#e84a4a', 3, 9); P(-1, -7, '#f0f0f0', 3, 1); P(-3, 2, '#3a5ad8', 2, 3); P(2, 2, '#3a5ad8', 2, 3); P(0, 4, '#ffd040', 1, 3); break;
    case 'clover': P(-3, -4, '#2ec84a', 3, 3); P(1, -4, '#2ec84a', 3, 3); P(-3, 0, '#2ec84a', 3, 3); P(1, 0, '#2ec84a', 3, 3); P(0, 2, '#1e8a3a', 1, 4); break;
    case 'egg': P(-3, -4, '#ffb0d8', 7, 9); P(-2, -5, '#ffb0d8', 5, 11); P(-3, -1, '#8ad0ff', 7, 2); P(-2, 2, '#fff0a0', 5, 1); break;
    case 'heart': P(-4, -3, '#ff3a6a', 4, 4); P(1, -3, '#ff3a6a', 4, 4); P(-3, 0, '#ff3a6a', 7, 3); P(-1, 3, '#ff3a6a', 3, 2); P(-3, -2, '#ffc0d0', 1, 1); break;
    case 'leaf': P(-3, -3, '#e86a1a', 7, 6); P(-1, -5, '#f0a030', 3, 10); P(0, 4, '#7a4a22', 1, 3); break;
    case 'tree': P(-1, -6, '#2a8a3a', 3, 3); P(-3, -3, '#2a8a3a', 7, 3); P(-4, 0, '#2a8a3a', 9, 3); P(0, 3, '#7a4a22', 1, 3); P(0, -7, '#ffd040', 1, 1); P(-2, -1, '#ff3a3a', 1, 1); P(2, 1, '#4ab8ff', 1, 1); break;
    case 'castle': P(-5, -3, '#4a4458', 11, 8); P(-5, -5, '#4a4458', 2, 2); P(-1, -5, '#4a4458', 2, 2); P(3, -5, '#4a4458', 2, 2); P(-1, 1, '#1a1020', 3, 4); P(-1, -8, col || '#d83a3a', 1, 3); break;
    case 'house': P(-4, -1, '#c8b090', 9, 5); P(-5, -2, '#6a3a8a', 11, 1); P(-3, -4, '#6a3a8a', 7, 2); P(0, 1, '#ffd060', 1, 2); break;
    default: break;
  }
}
const mapCache = {};
export function worldNodes(w, n) {
  // home, n stages, the boss castle: a winding road across the map
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: Math.round(30 + t * 320), y: Math.round(150 - Math.sin(t * Math.PI * 1.6 + w.id.length) * 46 - t * 30) });
  }
  return out;
}
function paintWorldMap(w, nodes) {
  const P = new Painter(W, H);
  const S = WSTYLE[w.id];
  const land = R(S.land), grass = R(S.grass), sea = R(S.sea), sand = R(S.sand);
  const seed = w.id.length * 11;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x / 70, y / 70, seed, 4);
    const edge = Math.min(x, W - x, y + 30, H - y) / 60;
    const v = n * 0.9 + Math.min(1, edge) * 0.55;
    if (v < 0.62) { P.set(x, y, P.pick(sea, Math.max(0.1, 0.4 + (v - 0.45) * 2 + (Math.sin(x / 6 + y / 9) > 0.92 ? 0.25 : 0)), x, y)); continue; }
    if (v < 0.65) { P.set(x, y, P.pick(sand, 0.7, x, y)); continue; }
    const d = fbm(x / 14, y / 14, seed + 9, 3);
    P.set(x, y, d > 0.55 ? P.pick(grass, 0.35 + vnoise(x / 3, y / 3, seed) * 0.5, x, y) : P.pick(land, 0.45 + d * 0.4, x, y));
  }
  // themed scatter
  for (let i = 0; i < 40; i++) {
    const x = 20 + hash2(i, 1, seed) * (W - 40), y = 40 + hash2(i, 2, seed) * (H - 70);
    if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 14)) continue;
    P.ellipse(x, y - 2, 2.4, 3, R(S.grass), { flat: 0.3 + hash2(i, 3) * 0.3 });
  }
  // road
  const road = R('#c8a878');
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let k = 1; k < n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * (i % 2 ? 6 : -6), y = a.y + (b.y - a.y) * t; P.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, road[1]); P.set(Math.round(x), Math.round(y), road[4]); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, y, W - 1 - x, H - 1 - y); if (e < 4) P.set(x, y, e < 1 ? hex('#1a1020') : e < 3 ? hex('#6a4a2a') : hex('#c8a060')); }
  return P.toCanvas();
}
export function nodePath(nodes, a, b, t) {
  const i = Math.max(a, b), tt = a < b ? t : 1 - t, P0 = nodes[Math.min(a, b)], P1 = nodes[Math.max(a, b)];
  return { x: P0.x + (P1.x - P0.x) * tt + Math.sin(tt * Math.PI) * (i % 2 ? 6 : -6), y: P0.y + (P1.y - P0.y) * tt };
}
// st: { node, walk, face }; wl: this world's levels (stages then boss); first: global index of its first level
export function drawMap(ctx, st, w, wl, first, save, t) {
  const nodes = worldNodes(w, wl.length);
  if (!mapCache[w.id]) mapCache[w.id] = paintWorldMap(w, nodes);
  ctx.drawImage(mapCache[w.id], 0, 0);
  const S = WSTYLE[w.id];
  icon(ctx, 'house', nodes[0].x, nodes[0].y, 1);
  for (let i = 1; i < nodes.length; i++) {
    const L = wl[i - 1], gi = first + i - 1, n = nodes[i];
    const open = gi <= save.reached, done = !!save.cleared[L.id];
    if (L.isBoss) { icon(ctx, 'castle', n.x, n.y, 1, done ? '#8cf05a' : S.accent); continue; }
    ctx.fillStyle = '#170c1e'; ctx.fillRect(n.x - 5, n.y - 3, 11, 7);
    ctx.fillStyle = done ? '#8cf05a' : open ? '#f0c040' : '#5a5060'; ctx.fillRect(n.x - 4, n.y - 2, 9, 5);
    ctx.fillStyle = done ? '#e8ff9a' : open ? '#fff0a0' : '#7a7080'; ctx.fillRect(n.x - 4, n.y - 2, 9, 1);
    if (open && !done && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(n.x, n.y - 7, 1, 3); }
  }
  const pos = st.walk ? nodePath(nodes, st.walk.from, st.walk.to, st.walk.t) : nodes[st.node];
  const moving = !!st.walk;
  const face = st.walk ? (nodes[st.walk.to].x >= nodes[st.walk.from].x ? 1 : -1) : st.face || 1;
  ctx.save(); ctx.translate(Math.round(pos.x), Math.round(pos.y + 2)); ctx.scale(0.75, 0.75);
  spr(ctx, S_.witchSprite('pip', moving ? 'walk' : 'idle', Math.floor(t * (moving ? 10 : 3))), -10 * face, 0, 28, 50, face);
  spr(ctx, S_.witchSprite('mags', moving ? 'walk' : 'idle', Math.floor(t * (moving ? 10 : 3))), 2 * face, 0, 28, 50, face);
  ctx.restore();
  // info panel
  ctx.fillStyle = 'rgba(18,8,24,0.84)'; ctx.fillRect(6, 6, W - 12, 26);
  ctx.fillStyle = '#c8a060'; ctx.fillRect(6, 31, W - 12, 1);
  const i = st.walk ? null : st.node;
  if (i === 0 || i == null) {
    drawText(ctx, w.name.toUpperCase(), 14, 11, '#fff6c8', { outline: true });
    drawText(ctx, w.holiday.toUpperCase(), 14, 21, '#b8a8d0', { shadow: null });
  } else {
    const L = wl[i - 1];
    drawText(ctx, L.name.toUpperCase(), 14, 11, '#fff6c8', { outline: true });
    drawText(ctx, (L.blurb || '').toUpperCase(), 14, 21, '#b8a8d0', { shadow: null });
    if (!L.isBoss) {
      let x = W - 14;
      const pg = !!save.pages[L.id], brew = !!save.brew[L.id];
      if (L.rooms?.length || L.id === 'hallo5') { drawText(ctx, 'PAGE', x, 15, pg ? '#ff9af0' : '#4a3a5a', { align: 'right', shadow: pg ? '#120818' : null }); x -= 30; }
      drawText(ctx, 'BREW', x, 15, brew ? '#f0c040' : '#4a3a5a', { align: 'right', shadow: brew ? '#120818' : null });
    } else if (save.cleared[L.id]) drawText(ctx, 'DEFEATED', W - 14, 15, '#8cf05a', { align: 'right' });
  }
  ctx.fillStyle = 'rgba(18,8,24,0.75)'; ctx.fillRect(6, H - 18, W - 12, 12);
  drawText(ctx, `PAGES ${Object.keys(save.pages).length}`, 12, H - 16, '#ff9af0', { shadow: null });
  drawText(ctx, `LIVES ${save.lives}  CARDS ${save.cards}`, 86, H - 16, '#fff0c0', { shadow: null });
  drawText(ctx, `${label('ok')} PLAY  ${label('back')} BACK`, W - 12, H - 16, '#8a7aa8', { align: 'right', shadow: null });
}
export function drawWorlds(ctx, sel, worlds, levels, save, t) {
  if (!titleBg) titleBg = paintTitleBg();
  ctx.drawImage(titleBg, 0, 0);
  ctx.fillStyle = 'rgba(8,4,14,0.55)'; ctx.fillRect(0, 0, W, H);
  drawText(ctx, 'CHOOSE A WORLD', W / 2, 18, '#fff6c8', { align: 'center', scale: 2, outline: true });
  let first = 0;
  worlds.forEach((w, i) => {
    const wl = levels.filter((l) => l.wi === i);
    const gi0 = levels.indexOf(wl[0]);
    const open = gi0 <= save.reached;
    const done = wl.filter((l) => save.cleared[l.id]).length;
    const x = 30 + i * 54, y = 92 + (i === sel ? -6 + Math.sin(t * 4) * 1.5 : 0);
    const S = WSTYLE[w.id];
    ctx.fillStyle = i === sel ? '#fff6c8' : '#2a1c34'; ctx.fillRect(x - 21, y - 21, 42, 42);
    ctx.fillStyle = open ? S.land : '#3a3044'; ctx.fillRect(x - 19, y - 19, 38, 38);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 19, y + 9, 38, 10);
    if (open) icon(ctx, S.icon, x, y - 2, 2);
    else drawText(ctx, '?', x, y - 8, '#8a7a9a', { align: 'center', scale: 2 });
    drawText(ctx, `${done}/${wl.length}`, x, y + 24, done === wl.length ? '#8cf05a' : '#b8a8d0', { align: 'center', shadow: null });
    first += wl.length;
  });
  const w = worlds[sel];
  drawText(ctx, w.name.toUpperCase(), W / 2, 142, '#ffe070', { align: 'center', scale: 2, outline: true });
  drawText(ctx, w.holiday.toUpperCase(), W / 2, 162, '#b8a8d0', { align: 'center', outline: true });
  const gi0 = levels.findIndex((l) => l.wi === sel);
  if (gi0 > save.reached) drawText(ctx, 'BEAT THE WORLD BEFORE IT TO OPEN THIS ONE', W / 2, 180, '#8a7a9a', { align: 'center', shadow: null });
  else if (Math.floor(t * 2) % 2 === 0) drawText(ctx, `PRESS ${label('ok')}`, W / 2, 184, '#fff6c8', { align: 'center', outline: true });
}

// ---------------------------------------------------------------------------------------------------------------
// overlays
export function drawCard(ctx, L, k) {
  // level name card: band slides in, holds, slides out (k 0..1)
  const a = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
  ctx.fillStyle = `rgba(8,4,14,${0.85 * a})`;
  const h = Math.round(48 * a);
  ctx.fillRect(0, H / 2 - h / 2, W, h);
  ctx.fillStyle = `rgba(200,160,96,${a})`;
  ctx.fillRect(0, H / 2 - h / 2, W, 1); ctx.fillRect(0, H / 2 + h / 2 - 1, W, 1);
  if (a > 0.6) {
    drawText(ctx, L.name.toUpperCase(), W / 2, H / 2 - 9, '#fff6c8', { align: 'center', scale: 2, outline: true });
    if (L.blurb) drawText(ctx, L.blurb.toUpperCase(), W / 2, H / 2 + 9, '#b8a8d0', { align: 'center', shadow: null });
  }
}
export function drawPause(ctx, sel, items) {
  ctx.fillStyle = 'rgba(8,4,14,0.6)'; ctx.fillRect(0, 0, W, H);
  const h = 22 + items.length * 14;
  const y0 = Math.round(H / 2 - h / 2);
  ctx.fillStyle = 'rgba(18,8,24,0.92)'; ctx.fillRect(W / 2 - 70, y0, 140, h);
  ctx.fillStyle = '#c8a060'; ctx.fillRect(W / 2 - 70, y0, 140, 1); ctx.fillRect(W / 2 - 70, y0 + h - 1, 140, 1);
  drawText(ctx, 'PAUSED', W / 2, y0 + 6, '#fff6c8', { align: 'center', outline: true });
  items.forEach((it, i) => drawText(ctx, (i === sel ? '> ' : '  ') + it, W / 2 - 46, y0 + 20 + i * 14, i === sel ? '#ffe070' : '#b8a8d0', { shadow: null }));
}
export function drawResults(ctx, L, st, t) {
  ctx.fillStyle = 'rgba(8,4,14,0.7)'; ctx.fillRect(0, 0, W, H);
  drawText(ctx, L.name.toUpperCase(), W / 2, 34, '#fff6c8', { align: 'center', scale: 2, outline: true });
  drawText(ctx, 'CLEARED!', W / 2, 54, '#8cf05a', { align: 'center', scale: 2, outline: true });
  const rows = [
    ['TAROT CARDS', `${st.cards}`, '#f0d890'],
    ['LETTERS', 'BREW'.split('').map((c, i) => (st.letters[i] ? c : '-')).join(' '), st.letters.every(Boolean) ? '#f0c040' : '#b8a8d0'],
    ['SPELLBOOK PAGE', st.page ? 'FOUND' : st.hasPage ? 'NOT FOUND' : '-', st.page ? '#ff9af0' : '#6a5a7a'],
  ];
  rows.forEach(([a, b, c], i) => {
    if (t < 0.4 + i * 0.35) return;
    drawText(ctx, a, W / 2 - 90, 90 + i * 18, '#b8a8d0', { outline: true });
    drawText(ctx, b, W / 2 + 90, 90 + i * 18, c, { align: 'right', outline: true });
  });
  if (t > 1.8 && Math.floor(t * 2) % 2 === 0) drawText(ctx, `PRESS ${label('ok')}`, W / 2, 170, '#fff6c8', { align: 'center', outline: true });
}
export function drawGameOver(ctx, t) {
  ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 0, W, H);
  drawText(ctx, 'GAME OVER', W / 2, 80, '#d84a4a', { align: 'center', scale: 3, outline: true });
  drawText(ctx, 'THE COVEN REGROUPS AT THE COTTAGE.', W / 2, 120, '#b8a8d0', { align: 'center', shadow: null });
  spr(ctx, S.witchSprite('mags', 'dead', Math.floor(t * 4)), W / 2 - 16, 170, 28, 50, 1);
  spr(ctx, S.witchSprite('pip', 'dead', Math.floor(t * 4) + 1), W / 2 + 16, 170, 28, 50, -1);
}
export function drawEnding(ctx, t, save) {
  if (!titleBg) titleBg = paintTitleBg();
  ctx.drawImage(titleBg, 0, 0);
  ctx.fillStyle = 'rgba(10,6,20,0.35)'; ctx.fillRect(0, 0, W, H);
  // hoard of cauldrons
  const kinds = ['clay', 'iron', 'clay', 'brew', 'clay', 'iron'];
  for (let i = 0; i < 22; i++) {
    const row = i < 9 ? 0 : i < 16 ? 1 : i < 20 ? 2 : 3;
    const inRow = [9, 7, 4, 2][row], idx = i - [0, 9, 16, 20][row];
    const x = W / 2 - (inRow - 1) * 8 + idx * 16, y = 196 - row * 12;
    spr(ctx, S.potSprite(kinds[i % kinds.length], Math.floor(t * 6) + i), x, y, 14, 25);
  }
  spr(ctx, S.witchSprite('mags', 'victory', Math.floor(t * 4)), W / 2 - 96, 196, 28, 50, 1);
  spr(ctx, S.witchSprite('pip', 'victory', Math.floor(t * 4) + 1), W / 2 + 96, 196, 28, 50, -1);
  const lines = [
    'THE DUCKING ENGINE LIES IN PIECES.',
    'THE WITCHFINDER RAN OFF WITHOUT HIS HAT.',
    'AND EVERY LAST CAULDRON IS HOME.',
  ];
  lines.forEach((l, i) => { if (t > 1 + i * 1.4) drawText(ctx, l, W / 2, 40 + i * 14, '#fff6c8', { align: 'center', outline: true }); });
  if (t > 5.5) {
    const pages = Object.keys(save.pages).length, brew = Object.keys(save.brew).length;
    drawText(ctx, `SPELLBOOK PAGES ${pages}/${save.totalPages || pages}    BREW SPELLED ${brew}/${save.totalBrew || brew}`, W / 2, 96, pages === 6 ? '#ff9af0' : '#b8a8d0', { align: 'center', outline: true });
    if (save.totalPages && pages >= save.totalPages) drawText(ctx, 'THE SPELLBOOK IS WHOLE AGAIN. NICE BREWING.', W / 2, 110, '#ffe070', { align: 'center', outline: true });
  }
  if (t > 7) drawText(ctx, 'THE END', W / 2, 128, '#8cf05a', { align: 'center', scale: 2, outline: true });
}
