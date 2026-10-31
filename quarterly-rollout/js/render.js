// Canvas drawing in a two-ink "risograph" style: navy ink over warm paper, with a coral second ink
// printed slightly out of register under walls and furniture. Everything is drawn with paths; the game
// ships no image files.

import { TILE, COLS, ROWS, HUD_H, VIEW_W, VIEW_H, PLAYER, BOT, CARL, PRINTER } from './config.js';
import { formatTime } from './world.js';
import { CARL_LINES } from './story.js';

export const PALETTE = {
  paper: '#f4ecdc', paper2: '#e9dcc2', ink: '#22305b', ink2: '#3b4a7a', coral: '#ef6a55', mustard: '#f2b544',
  teal: '#2b9a8f', mint: '#a9dccf', leaf: '#3f8f5a', steel: '#a5adb6', steelDark: '#6d7682', coffee: '#6b4226',
  cream: '#fff8ea', skin: '#d9a77c', hair: '#4a2c2a',
};
const P = PALETTE;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// stable pseudo-random number in [0, 1) for tile decoration
export function hash(a, b, k = 0) {
  let h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(k + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function circle(g, x, y, r, fill, stroke, lw = 2) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function drawFloor(g, t, c, r) {
  const x = c * TILE, y = r * TILE;
  if (t.floor === 'lino') {
    g.fillStyle = (c + r) % 2 ? P.cream : P.mint;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = 'rgba(34,48,91,0.06)';
    g.fillRect(x, y, TILE, 1);
    return;
  }
  if (t.floor === 'vent') {
    g.fillStyle = '#d8dde2';
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = 'rgba(34,48,91,0.22)';
    for (let i = 4; i < TILE; i += 6) g.fillRect(x + 3, y + i, TILE - 6, 2);
    return;
  }
  g.fillStyle = P.paper;
  g.fillRect(x, y, TILE, TILE);
  g.fillStyle = 'rgba(43,154,143,0.18)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if ((i + j) % 2) continue;
    g.fillRect(x + 4 + i * 8, y + 4 + j * 8, 2, 2);
  }
  if (t.floor === 'cable') {
    g.strokeStyle = 'rgba(34,48,91,0.75)';
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const oy = y + 7 + k * 9, ph = hash(c, r, k) * 6;
      g.beginPath();
      g.moveTo(x, oy);
      for (let s = 0; s <= TILE; s += 4) g.lineTo(x + s, oy + Math.sin((s + ph * 5) / 5) * 3);
      g.stroke();
    }
  }
  if (t.tacks) {
    g.fillStyle = P.coral;
    for (let k = 0; k < 5; k++) {
      const tx = x + 5 + hash(c, r, k) * 22, ty = y + 5 + hash(r, c, k + 9) * 22;
      g.beginPath(); g.moveTo(tx, ty - 3); g.lineTo(tx + 3, ty + 2); g.lineTo(tx - 3, ty + 2); g.closePath(); g.fill();
    }
  }
}

function drawSpills(g, tiles) {
  // coffee is drawn as overlapping blobs so neighbouring spill tiles merge into one puddle
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c].floor !== 'coffee') continue;
    const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
    circle(g, x + (hash(c, r) - 0.5) * 6, y + (hash(r, c) - 0.5) * 6, 21, P.coffee);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c].floor !== 'coffee') continue;
    circle(g, (c + 0.35) * TILE, (r + 0.35) * TILE, 4, 'rgba(255,248,234,0.35)');
  }
}

function drawSolid(g, t, c, r) {
  const x = c * TILE, y = r * TILE;
  if (t.kind === 'wall') {
    g.fillStyle = P.ink;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    if (hash(c, r) > 0.5) g.fillRect(x + 4, y + 4, TILE - 8, 3);
  } else if (t.kind === 'desk') {
    g.fillStyle = P.mustard;
    g.fillRect(x, y, TILE, TILE);
    g.strokeStyle = P.ink; g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    const v = hash(c, r);
    if (v < 0.45) { g.fillStyle = P.ink; g.fillRect(x + 7, y + 6, 18, 11); g.fillStyle = P.mint; g.fillRect(x + 9, y + 8, 14, 7); }
    else if (v < 0.75) { g.fillStyle = P.cream; g.fillRect(x + 6, y + 8, 12, 15); g.fillRect(x + 10, y + 6, 12, 15); }
    else { circle(g, x + 16, y + 16, 5, P.cream, P.ink, 1.5); }
  } else if (t.kind === 'plant') {
    g.fillStyle = P.paper; g.fillRect(x, y, TILE, TILE);
    circle(g, x + 16, y + 16, 11, P.coral, P.ink, 2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + hash(c, r) * 2;
      circle(g, x + 16 + Math.cos(a) * 7, y + 16 + Math.sin(a) * 7, 6, P.leaf);
    }
    circle(g, x + 16, y + 16, 4, '#5fb37a');
  }
}

export function buildFloorLayer(world, makeCanvas) {
  const cv = makeCanvas(COLS * TILE, ROWS * TILE);
  const g = cv.getContext('2d');
  const { tiles } = world;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawFloor(g, tiles[r][c], c, r);
  drawSpills(g, tiles);
  // the second ink, out of register: a coral offset under every wall and desk
  g.fillStyle = P.coral;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = tiles[r][c].kind;
    if (k === 'wall' || k === 'desk') g.fillRect(c * TILE + 3, r * TILE + 3, TILE, TILE);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = tiles[r][c];
    if (t.solid && t.kind !== 'printer') drawSolid(g, t, c, r);
  }
  return cv;
}

function drawVentArrows(g, w, t) {
  g.strokeStyle = 'rgba(43,154,143,0.75)';
  g.lineWidth = 2;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = w.tiles[r][c].draft;
    if (!d) continue;
    const phase = ((t * 1.6 + hash(c, r) * 0.2) % 1) * TILE - TILE / 2;
    const cx = (c + 0.5) * TILE + d[0] * phase, cy = (r + 0.5) * TILE + d[1] * phase;
    const px = -d[1], py = d[0];
    g.beginPath();
    g.moveTo(cx - d[0] * 4 + px * 5, cy - d[1] * 4 + py * 5);
    g.lineTo(cx + d[0] * 2, cy + d[1] * 2);
    g.lineTo(cx - d[0] * 4 - px * 5, cy - d[1] * 4 - py * 5);
    g.stroke();
  }
}

function drawPrinter(g, pr, t) {
  const x = pr.col * TILE, y = pr.row * TILE;
  g.fillStyle = P.coral; g.fillRect(x + 3, y + 3, TILE, TILE);
  g.fillStyle = P.steel; g.fillRect(x, y, TILE, TILE);
  g.strokeStyle = P.ink; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  g.fillStyle = P.cream; g.fillRect(x + 6, y + 5, 20, 8);
  g.fillStyle = P.steelDark; g.fillRect(x + 5, y + 18, 22, 4);
  const warn = pr.timer < 0.45 || pr.flash > 0;
  circle(g, x + 25, y + 26, 3, warn && Math.floor(t * 12) % 2 ? P.coral : P.leaf);
}

function drawExits(g, w, t) {
  for (const e of w.exits) {
    const x = e.col * TILE, y = e.row * TILE;
    if (w.exitOpen) {
      g.fillStyle = P.ink; g.fillRect(x, y, TILE, TILE);
      g.fillStyle = `rgba(169,220,207,${0.35 + 0.25 * Math.sin(t * 5)})`;
      g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    } else {
      g.fillStyle = P.steel; g.fillRect(x, y, TILE, TILE);
      g.fillStyle = P.steelDark; g.fillRect(x + TILE / 2 - 1, y, 2, TILE);
      g.strokeStyle = P.ink; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    }
  }
  if (!w.exits.length) return;
  // one sign over the whole elevator
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const e of w.exits) { minC = Math.min(minC, e.col); maxC = Math.max(maxC, e.col); minR = Math.min(minR, e.row); maxR = Math.max(maxR, e.row); }
  const cx = ((minC + maxC + 1) / 2) * TILE, cy = ((minR + maxR + 1) / 2) * TILE;
  g.fillStyle = w.exitOpen ? P.mint : P.coral;
  g.beginPath();
  if (w.exitOpen) { const b = Math.sin(t * 6) * 3; g.moveTo(cx, cy - 12 + b); g.lineTo(cx + 9, cy + b); g.lineTo(cx - 9, cy + b); }
  else { g.rect(cx - 7, cy - 7, 14, 14); }
  g.fill();
}

function drawPage(g, pg, t, i) {
  const bob = Math.sin(t * 3 + i) * 2;
  g.save();
  g.translate(pg.x, pg.y + bob);
  g.rotate(Math.sin(i * 1.7) * 0.3);
  g.fillStyle = 'rgba(34,48,91,0.18)'; g.fillRect(-7, -8, 16, 20);
  g.fillStyle = P.cream; g.fillRect(-9, -11, 16, 20);
  g.strokeStyle = P.ink; g.lineWidth = 1.5; g.strokeRect(-9, -11, 16, 20);
  g.fillStyle = P.ink2;
  for (let k = 0; k < 4; k++) g.fillRect(-6, -7 + k * 4, k === 3 ? 6 : 10, 1.5);
  g.fillStyle = P.coral; g.fillRect(-6, 5, 4, 2);
  g.restore();
  const s = (t * 2 + i * 0.37) % 1;
  if (s < 0.3) {
    g.strokeStyle = P.mustard; g.lineWidth = 2;
    const sx = pg.x + 10, sy = pg.y - 12 + bob, k = 3 + s * 10;
    g.beginPath(); g.moveTo(sx - k, sy); g.lineTo(sx + k, sy); g.moveTo(sx, sy - k); g.lineTo(sx, sy + k); g.stroke();
  }
}

function drawMug(g, c, t) {
  const y = c.y + Math.sin(t * 2.5 + c.x) * 1.5;
  circle(g, c.x + 3, y + 3, 9, 'rgba(34,48,91,0.18)');
  g.fillStyle = P.cream; g.strokeStyle = P.ink; g.lineWidth = 2;
  g.beginPath(); g.arc(c.x + 9, y, 4, -Math.PI / 2, Math.PI / 2); g.stroke();
  circle(g, c.x, y, 9, P.cream, P.ink, 2);
  circle(g, c.x, y, 6, P.coffee);
  g.strokeStyle = 'rgba(169,220,207,0.9)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(c.x - 3, y - 12); g.quadraticCurveTo(c.x, y - 16 - Math.sin(t * 4) * 2, c.x + 3, y - 20); g.stroke();
}

function stars(g, x, y, t) {
  g.fillStyle = P.mustard;
  for (let k = 0; k < 3; k++) {
    const a = t * 5 + (k * Math.PI * 2) / 3;
    circle(g, x + Math.cos(a) * 12, y - 12 + Math.sin(a) * 4, 2.5, P.mustard);
  }
}

function drawBot(g, b, t) {
  circle(g, b.x + 3, b.y + 3, BOT.radius, 'rgba(34,48,91,0.2)');
  circle(g, b.x, b.y, BOT.radius, P.mint, P.ink, 2.5);
  const spin = b.stun > 0 ? 0 : t * 14;
  g.strokeStyle = P.coral; g.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const a = spin + (k * Math.PI) / 2;
    g.beginPath(); g.moveTo(b.x + Math.cos(a) * 4, b.y + Math.sin(a) * 4); g.lineTo(b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10); g.stroke();
  }
  circle(g, b.x + b.dx * 6, b.y + b.dy * 6, 3, b.stun > 0 ? P.steelDark : P.coral);
  if (b.stun > 0) stars(g, b.x, b.y, t);
}

function bubble(g, x, y, text) {
  g.font = `600 12px ${FONT}`;
  const w = g.measureText(text).width + 14;
  const bx = Math.min(VIEW_W - w - 4, Math.max(4, x - w / 2)), by = Math.max(4, y - 44);
  g.fillStyle = P.cream; g.strokeStyle = P.ink; g.lineWidth = 2;
  roundRect(g, bx, by, w, 22, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 4, by + 22); g.lineTo(x, by + 30); g.lineTo(x + 4, by + 22); g.fill();
  g.fillStyle = P.ink; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, bx + 7, by + 11.5);
}

function drawCarl(g, c, w, t) {
  const p = w.player;
  const a = Math.atan2(p.y - c.y, p.x - c.x);
  circle(g, c.x + 3, c.y + 3, CARL.radius, 'rgba(34,48,91,0.2)');
  g.save();
  g.translate(c.x, c.y);
  g.rotate(a);
  g.fillStyle = P.teal; g.strokeStyle = P.ink; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  // the ever-present calendar
  g.fillStyle = P.cream; g.fillRect(7, -6, 9, 11); g.strokeRect(7, -6, 9, 11);
  g.fillStyle = P.coral; g.fillRect(7, -6, 9, 3);
  circle(g, -1, 0, 6.5, P.skin, P.ink, 2);
  g.fillStyle = P.ink; g.fillRect(-6, -3, 3, 6);
  g.restore();
  if (c.stun > 0) stars(g, c.x, c.y, t);
  if (c.say > 0) bubble(g, c.x, c.y, CARL_LINES[(c.line - 1 + CARL_LINES.length) % CARL_LINES.length]);
}

function drawWad(g, wd, t) {
  circle(g, wd.x + 2, wd.y + 2, PRINTER.wadRadius, 'rgba(34,48,91,0.25)');
  circle(g, wd.x, wd.y, PRINTER.wadRadius, P.cream, P.ink, 1.5);
  g.strokeStyle = P.ink2; g.lineWidth = 1;
  g.beginPath(); g.moveTo(wd.x - 3, wd.y - 1); g.lineTo(wd.x + 1, wd.y + 2); g.lineTo(wd.x + 3, wd.y - 2); g.stroke();
}

// Bea, seen from above on Old Squeaky: five casters, a coral seat, a mustard blazer.
export function drawPlayer(g, p, t, scale = 1) {
  const blink = p.invuln > 0 && Math.floor(t * 16) % 2 === 0;
  if (blink) return;
  const spinning = p.spin > 0;
  g.save();
  g.translate(p.x, p.y);
  g.scale(scale, scale);
  circle(g, 3, 4, PLAYER.radius + 3, 'rgba(34,48,91,0.22)');
  const base = p.wheel / 9 + (spinning ? t * 30 : 0);
  g.strokeStyle = P.ink; g.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    const a = base + (k * Math.PI * 2) / 5;
    const ex = Math.cos(a) * 15, ey = Math.sin(a) * 15;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(ex, ey); g.stroke();
    circle(g, ex, ey, 3, P.ink);
  }
  g.rotate(spinning ? p.angle + t * 25 : p.angle);
  circle(g, 0, 0, 11, P.coral, P.ink, 2);
  g.fillStyle = P.mustard; g.strokeStyle = P.ink; g.lineWidth = 2;
  g.beginPath(); g.ellipse(-1, 0, 7, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = P.mustard;
  g.fillRect(2, -11, 7, 4); g.fillRect(2, 7, 7, 4);
  circle(g, -1, 0, 6, P.skin, P.ink, 2);
  circle(g, -4, 0, 4, P.hair);
  circle(g, -7, 0, 2.5, P.hair);
  g.restore();
  if (spinning) {
    g.strokeStyle = 'rgba(239,106,85,0.8)'; g.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const a = -t * 25 + (k * Math.PI * 2) / 3;
      g.beginPath(); g.arc(p.x, p.y, 20, a, a + 1.1); g.stroke();
    }
  }
}

function drawHUD(g, w, ui) {
  g.fillStyle = P.ink; g.fillRect(0, 0, VIEW_W, HUD_H);
  g.fillStyle = P.coral; g.fillRect(0, HUD_H - 3, VIEW_W, 3);
  g.textBaseline = 'middle';
  g.fillStyle = P.mustard; g.font = `700 13px ${FONT}`; g.textAlign = 'left';
  g.fillText(`FLOOR ${w.def.floor}`, 14, HUD_H / 2 - 1);
  g.fillStyle = P.cream; g.font = `600 16px ${FONT}`;
  g.fillText(w.def.name, 80, HUD_H / 2 - 1);

  // pages
  const total = w.pages.length;
  const px = 360;
  for (let i = 0; i < total; i++) {
    const got = i < total - w.pagesLeft;
    const x = px + i * 16;
    g.fillStyle = got ? P.cream : 'rgba(255,248,234,0.18)';
    g.fillRect(x, 13, 11, 15);
    if (got) { g.fillStyle = P.ink2; g.fillRect(x + 2, 17, 7, 1.5); g.fillRect(x + 2, 21, 5, 1.5); }
  }
  g.fillStyle = w.exitOpen ? P.mint : P.cream; g.font = `600 13px ${FONT}`;
  g.fillText(w.exitOpen ? 'Elevator open!' : `${total - w.pagesLeft}/${total} pages`, px + total * 16 + 6, HUD_H / 2 - 1);

  // composure: coffee mugs
  const mx = 650;
  g.fillStyle = 'rgba(255,248,234,0.7)'; g.font = `600 11px ${FONT}`;
  g.fillText('COMPOSURE', mx, HUD_H / 2 - 1);
  for (let i = 0; i < PLAYER.maxComposure; i++) {
    const full = i < w.player.composure;
    const x = mx + 86 + i * 24, y = HUD_H / 2 - 1;
    g.strokeStyle = full ? P.cream : 'rgba(255,248,234,0.3)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x + 8, y, 3.5, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.fillStyle = full ? P.cream : 'rgba(255,248,234,0.15)';
    g.fillRect(x - 6, y - 8, 13, 16);
    if (full) { g.fillStyle = P.coffee; g.fillRect(x - 4, y - 6, 9, 4); }
  }

  g.textAlign = 'right'; g.fillStyle = P.cream; g.font = `600 16px ui-monospace, "SF Mono", Menlo, monospace`;
  g.fillText(formatTime(w.time), VIEW_W - 14, HUD_H / 2 - 1);
  if (ui && ui.muted) {
    g.font = `600 11px ${FONT}`; g.fillStyle = 'rgba(255,248,234,0.6)';
    g.fillText('MUTED', VIEW_W - 92, HUD_H / 2 - 1);
  }
}

function drawToast(g, ui, now) {
  if (!ui || !ui.toast || now > ui.toast.until) return;
  const left = ui.toast.until - now;
  const alpha = Math.min(1, left / 0.4);
  g.globalAlpha = alpha;
  g.font = `800 22px ${FONT}`;
  const w = g.measureText(ui.toast.text).width + 36;
  const x = (VIEW_W - w) / 2, y = HUD_H + 18;
  g.fillStyle = P.coral; roundRect(g, x + 4, y + 4, w, 40, 10); g.fill();
  g.fillStyle = P.cream; g.strokeStyle = P.ink; g.lineWidth = 2.5;
  roundRect(g, x, y, w, 40, 10); g.fill(); g.stroke();
  g.fillStyle = P.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ui.toast.text, VIEW_W / 2, y + 21);
  g.globalAlpha = 1;
}

export function createRenderer(ctx, makeCanvas) {
  let layer = null, layerWorld = null;

  function draw(w, ui = {}) {
    const t = w.time;
    const now = ui.now ?? t;
    if (layerWorld !== w) { layer = buildFloorLayer(w, makeCanvas); layerWorld = w; }
    ctx.save();
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const sh = w.shake > 0 ? w.shake * 22 : 0;
    ctx.translate((hash(Math.floor(now * 60), 1) - 0.5) * sh, HUD_H + (hash(Math.floor(now * 60), 2) - 0.5) * sh);
    ctx.drawImage(layer, 0, 0);
    drawVentArrows(ctx, w, now);
    for (const pr of w.printers) drawPrinter(ctx, pr, now);
    drawExits(ctx, w, now);
    w.pages.forEach((pg, i) => { if (!pg.taken) drawPage(ctx, pg, now, i); });
    for (const c of w.coffees) if (!c.taken) drawMug(ctx, c, now);
    for (const b of w.bots) drawBot(ctx, b, now);
    for (const wd of w.wads) drawWad(ctx, wd, now);
    drawPlayer(ctx, w.player, now);
    for (const c of w.carls) drawCarl(ctx, c, w, now);
    ctx.restore();
    drawHUD(ctx, w, ui);
    drawToast(ctx, ui, now);
  }

  return { draw };
}
