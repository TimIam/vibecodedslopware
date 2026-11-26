// screens.js — title, world map, level card, results, game over and the ending. Pure drawing + tiny state.
import { W, H } from './world.js';
import { Painter, ramp, hex, css, drawText, textWidth, fbm, hash2, vnoise, BAYER4 } from './pix.js';
import * as S from './sprites.js';
import { spr } from './render.js';

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
// world map
export const MAP_NODES = [
  { id: 'home', x: 34, y: 190, name: 'Coven Cottage' },
  { id: 'wood', x: 78, y: 168 },
  { id: 'bog', x: 132, y: 150 },
  { id: 'mine', x: 160, y: 96 },
  { id: 'belfry', x: 232, y: 124 },
  { id: 'village', x: 282, y: 166 },
  { id: 'keep', x: 322, y: 104 },
  { id: 'boss', x: 344, y: 62 },
];
function paintMap() {
  const P = new Painter(W, H);
  const sea = R('#2a4a7a'), grass = R('#5a8a3a'), forest = R('#2e5a2a'), bogc = R('#4a6a4a'), rock = R('#7a7488'), snow = R('#e8eef8'), road = R('#c8a878');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x / 70, y / 70, 3, 4);
    const edge = Math.min(x, W - x, y + 30, H - y) / 60;
    const land = n * 0.9 + Math.min(1, edge) * 0.55;
    if (land < 0.62) { const l = 0.4 + (land - 0.45) * 2 + (Math.sin(x / 6 + y / 9) > 0.92 ? 0.25 : 0); P.set(x, y, P.pick(sea, Math.max(0.1, l), x, y)); continue; }
    if (land < 0.65) { P.set(x, y, P.pick(R('#d8c890'), 0.7, x, y)); continue; }
    // regions
    const mtn = Math.max(0, 1 - Math.hypot(x - 175, y - 70) / 70) + Math.max(0, 1 - Math.hypot(x - 260, y - 40) / 60) * 0.6;
    const bogk = Math.max(0, 1 - Math.hypot(x - 128, y - 150) / 34);
    const wood = Math.max(0, 1 - Math.hypot(x - 72, y - 160) / 50);
    let col;
    const d = fbm(x / 14, y / 14, 9, 3);
    if (mtn > 0.35 + d * 0.2) {
      const hgt = mtn + d * 0.3;
      col = hgt > 0.95 ? P.pick(snow, 0.8 + d * 0.2, x, y) : P.pick(rock, 0.3 + hgt * 0.5 + (fbm(x / 5, y / 5, 4) - 0.5) * 0.6, x, y);
    } else if (bogk > 0.2 + d * 0.3) col = P.pick(bogc, 0.4 + d * 0.4, x, y);
    else if (wood > 0.15 + d * 0.3) col = P.pick(forest, 0.35 + vnoise(x / 3, y / 3, 5) * 0.5, x, y);
    else col = P.pick(grass, 0.45 + d * 0.4, x, y);
    P.set(x, y, col);
  }
  // trees in the forest
  for (let i = 0; i < 70; i++) {
    const a = hash2(i, 1) * 6.28, r = Math.sqrt(hash2(i, 2)) * 44;
    const x = 72 + Math.cos(a) * r, y = 160 + Math.sin(a) * r * 0.7;
    P.ellipse(x, y - 3, 2.6, 3.4, R('#2a6a2a'));
    P.set(x, y + 1, hex('#3a2418'));
  }
  // bog pools
  for (let i = 0; i < 10; i++) { const x = 118 + hash2(i, 4) * 28, y = 140 + hash2(i, 5) * 22; P.ellipse(x, y, 3 + hash2(i, 6) * 3, 1.6, R('#4a7a6a'), { flat: 0.7 }); }
  // mine mouth
  P.ellipse(160, 100, 6, 5, R('#1a1418'), { flat: 0.2, clip: (x, y) => y < 101 });
  P.rect(154, 100, 13, 2, hex('#7a5434'));
  // belfry town: steeples
  for (let i = 0; i < 6; i++) {
    const x = 220 + i * 6, y = 128 - (i % 3) * 3;
    P.poly([[x - 2, y], [x + 2, y], [x, y - 10 - (i % 2) * 5]], R('#4a4a6a'), { flat: 0.4 });
    P.rect(x - 2, y, 5, 6, hex('#7a6a6a'));
  }
  // village roofs
  for (let i = 0; i < 9; i++) {
    const x = 270 + (i % 5) * 7, y = 162 + Math.floor(i / 5) * 8;
    P.poly([[x - 4, y], [x + 4, y], [x, y - 5]], R('#a04a3a'), { flat: 0.5 });
    P.rect(x - 3, y, 7, 4, hex('#d8c8a0'));
    P.set(x, y + 2, hex('#ffd060'));
  }
  // the keep on its hill
  P.ellipse(330, 96, 26, 14, R('#5a5a4a'), { flat: 0.5 });
  for (const [x, w, h] of [[316, 6, 22], [326, 10, 30], [338, 6, 24], [346, 5, 16]]) {
    P.rect(x - w / 2, 92 - h, w, h, hex('#6a6878'));
    for (let k = 0; k < w; k += 2) P.set(x - w / 2 + k, 91 - h, hex('#6a6878'));
    P.set(x, 92 - h + 6, hex('#ffd060'));
  }
  P.poly([[322, 62], [330, 62], [326, 52]], R('#8a2a3a'), { flat: 0.5 });
  // cottage
  P.poly([[26, 186], [42, 186], [34, 177]], R('#6a3a8a'), { flat: 0.5 });
  P.rect(28, 186, 13, 8, hex('#c8b090'));
  P.set(34, 189, hex('#ffd060'));
  P.capsule(38, 180, 38, 176, 1, 1, R('#4a4a4a'));
  // paths
  for (let i = 1; i < MAP_NODES.length; i++) {
    const a = MAP_NODES[i - 1], b = MAP_NODES[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * ((i % 2) ? 6 : -6), y = a.y + (b.y - a.y) * t;
      P.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, road[1]);
      P.set(Math.round(x), Math.round(y), road[4]);
    }
  }
  // parchment frame
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 4) P.set(x, y, e < 1 ? hex('#1a1020') : e < 3 ? hex('#6a4a2a') : hex('#c8a060'));
  }
  return P.toCanvas();
}
export function nodePath(a, b, t) {
  const A = MAP_NODES[a], B = MAP_NODES[b];
  const i = Math.max(a, b);
  const tt = a < b ? t : 1 - t;
  const P0 = a < b ? A : B, P1 = a < b ? B : A;
  return { x: P0.x + (P1.x - P0.x) * tt + Math.sin(tt * Math.PI) * ((i % 2) ? 6 : -6), y: P0.y + (P1.y - P0.y) * tt };
}
export function drawMap(ctx, st, levels, save, t) {
  if (!mapBg) mapBg = paintMap();
  ctx.drawImage(mapBg, 0, 0);
  // nodes
  for (let i = 1; i < MAP_NODES.length; i++) {
    const n = MAP_NODES[i], L = levels[i - 1];
    if (!L) continue;
    const open = i - 1 <= save.reached;
    const done = !!save.cleared[L.id];
    const x = n.x, y = n.y;
    ctx.fillStyle = '#170c1e'; ctx.fillRect(x - 5, y - 3, 11, 7);
    ctx.fillStyle = done ? '#8cf05a' : open ? '#f0c040' : '#5a5060'; ctx.fillRect(x - 4, y - 2, 9, 5);
    ctx.fillStyle = done ? '#e8ff9a' : open ? '#fff0a0' : '#7a7080'; ctx.fillRect(x - 4, y - 2, 9, 1);
    if (open && !done && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(x, y - 7, 1, 3); }
  }
  // witch on the path
  const pos = st.walk ? nodePath(st.walk.from, st.walk.to, st.walk.t) : MAP_NODES[st.node];
  const moving = !!st.walk;
  const face = st.walk ? (MAP_NODES[st.walk.to].x >= MAP_NODES[st.walk.from].x ? 1 : -1) : st.face || 1;
  ctx.save(); ctx.translate(Math.round(pos.x), Math.round(pos.y + 2)); ctx.scale(0.75, 0.75);
  spr(ctx, S.witchSprite('pip', moving ? 'walk' : 'idle', Math.floor(t * (moving ? 10 : 3))), -10 * face, 0, 28, 50, face);
  spr(ctx, S.witchSprite('mags', moving ? 'walk' : 'idle', Math.floor(t * (moving ? 10 : 3))), 2 * face, 0, 28, 50, face);
  ctx.restore();
  // info panel
  const i = st.walk ? null : st.node;
  ctx.fillStyle = 'rgba(18,8,24,0.82)'; ctx.fillRect(6, 6, W - 12, 26);
  ctx.fillStyle = '#c8a060'; ctx.fillRect(6, 31, W - 12, 1);
  if (i === 0) {
    drawText(ctx, 'COVEN COTTAGE', 14, 11, '#fff6c8', { outline: true });
    drawText(ctx, 'HOME. THE CAULDRON SHELF IS EMPTY.', 14, 21, '#b8a8d0', { shadow: null });
  } else if (i != null) {
    const L = levels[i - 1];
    drawText(ctx, L.name.toUpperCase(), 14, 11, '#fff6c8', { outline: true });
    drawText(ctx, L.blurb ? L.blurb.toUpperCase() : '', 14, 21, '#b8a8d0', { shadow: null });
    // completion marks
    let x = W - 14;
    const pg = !!save.pages[L.id], brew = !!save.brew[L.id];
    if (L.boss) { drawText(ctx, save.cleared[L.id] ? 'DEFEATED' : '', x, 15, '#8cf05a', { align: 'right' }); }
    else {
      drawText(ctx, pg ? 'PAGE' : 'PAGE', x, 15, pg ? '#ff9af0' : '#4a3a5a', { align: 'right', shadow: pg ? '#120818' : null });
      x -= 30;
      drawText(ctx, 'BREW', x, 15, brew ? '#f0c040' : '#4a3a5a', { align: 'right', shadow: brew ? '#120818' : null });
      x -= 30;
      if (save.cleared[L.id]) drawText(ctx, 'CLEARED', x, 15, '#8cf05a', { align: 'right' });
    }
  }
  // footer
  const pages = Object.keys(save.pages).length;
  ctx.fillStyle = 'rgba(18,8,24,0.75)'; ctx.fillRect(6, H - 18, W - 12, 12);
  drawText(ctx, `PAGES ${pages}/6`, 12, H - 16, '#ff9af0', { shadow: null });
  drawText(ctx, `LIVES ${save.lives}   CARDS ${save.cards}`, W / 2, H - 16, '#d8f4ff', { align: 'center', shadow: null });
  drawText(ctx, 'JUMP: ENTER', W - 12, H - 16, '#8a7aa8', { align: 'right', shadow: null });
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
  if (t > 1.8 && Math.floor(t * 2) % 2 === 0) drawText(ctx, 'PRESS JUMP', W / 2, 170, '#fff6c8', { align: 'center', outline: true });
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
    drawText(ctx, `SPELLBOOK PAGES ${pages}/6    BREW SPELLED ${brew}/6`, W / 2, 96, pages === 6 ? '#ff9af0' : '#b8a8d0', { align: 'center', outline: true });
    if (pages === 6) drawText(ctx, 'THE SPELLBOOK IS WHOLE AGAIN. NICE BREWING.', W / 2, 110, '#ffe070', { align: 'center', outline: true });
  }
  if (t > 7) drawText(ctx, 'THE END', W / 2, 128, '#8cf05a', { align: 'center', scale: 2, outline: true });
}
