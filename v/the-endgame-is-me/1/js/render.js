// Draws a game state into a 320×180 buffer. Everything lands on whole pixels.

import { PAL, drawText, textWidth, ICONS, makeBossSprites, BOSS_DIRS, BOSS_SIZE, tinted, hash, newCanvas } from './art.js';
import { W, H, A, B, LEASH, ABIL, ORDER, CLASS, angDiff, segDist, segNearest } from './world.js';

const TAU = Math.PI * 2;
const KEYS = { swipe: 'LMB', stomp: 'RMB', breath: 'Q', roar: 'E', shake: 'SPC' };

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function createRenderer() {
  const buf = newCanvas(W, H), ctx = buf.getContext('2d');
  const boss = makeBossSprites();
  const bg = makeBackground(), fg = makeForeground(), shadow = makeShadow();
  const trail = newCanvas(W, H), tctx = trail.getContext('2d');
  let fps = 0;

  function render(g, view = {}) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const s = g.shake > 0 ? Math.ceil(g.shake * 4) : 0;
    const ox = s ? ((Math.floor(g.t * 40) % 2) ? s : -s) : 0, oy = s ? ((Math.floor(g.t * 33) % 2) ? s : -s) * 0.6 : 0;
    ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H);
    ctx.translate(Math.round(ox), Math.round(oy));
    ctx.drawImage(bg, 0, 0);

    // footprints wear the path in over time
    for (const st of g.steps) {
      const px = -Math.sin(st.face), py = Math.cos(st.face), sd = st.side ? 6 : -6;
      tctx.fillStyle = 'rgba(40,30,18,0.16)';
      tctx.fillRect(Math.round(st.x + px * sd + Math.cos(st.face) * 3), Math.round(st.y + py * sd + Math.sin(st.face) * 3), 2, 2);
    }
    g.steps.length = 0;
    ctx.drawImage(trail, 0, 0);

    drawLeash(ctx, g);
    drawFires(ctx, g);
    drawTelegraph(ctx, g);
    for (const c of g.corpses) drawCorpse(ctx, c);
    for (const r of g.rings) if (r.col !== 'slash') drawRing(ctx, r);

    // y-sorted: adventurers, loose horses, the boss
    const list = [];
    for (const u of g.units) {
      if (u.role === 'rider') {
        if (!u.mounted) list.push({ y: u.horse.y, f: () => drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, false, g.t) });
        if (u.state !== 'climb') list.push({ y: u.y, f: () => drawRider(ctx, u, g) });
      } else list.push({ y: u.y, f: () => drawUnit(ctx, u, g) });
    }
    for (const p of g.parts) if (p.horse) list.push({ y: p.y, f: () => drawHorse(ctx, p.x, p.y, p.face, p.walk, false, g.t) });
    list.push({ y: g.boss.y + 2, f: () => drawBoss(ctx, g) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();
    for (const u of g.units) if (u.role === 'rider' && u.state === 'climb') drawClimber(ctx, u, g);

    for (const o of g.bolts) drawBolt(ctx, o);
    for (const r of g.rings) if (r.col === 'slash') drawSlash(ctx, r);
    for (const p of g.parts) if (!p.horse) drawPart(ctx, p);
    ctx.drawImage(fg, 0, 0);
    for (const o of g.ghosts) drawGhost(ctx, o);
    for (const t of g.texts) {
      const k = t.t / t.life, a = k > 0.7 ? (1 - k) / 0.3 : 1;
      drawText(ctx, t.s, t.x, t.y - k * 10, t.col, { align: 'center', alpha: a });
    }
    for (const k of g.barks) drawBark(ctx, k);
    if (g.thought && !g.boss.dead) drawThought(ctx, g);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!view.bare) drawHud(ctx, g, view);
    if (view.cursor) drawCursor(ctx, view.mx, view.my, g);
    return buf;
  }

  function drawBoss(ctx, g) {
    const b = g.boss;
    const a = ((b.face % TAU) + TAU) % TAU;
    const dir = Math.round(a / TAU * BOSS_DIRS) % BOSS_DIRS;
    const act = b.act;
    const mouth = act && (act.kind === 'breath' || act.kind === 'roar') ? 1 : 0;
    let frame = b.moving ? Math.floor(b.walk / 2.2) % 4 : 0;
    let lift = 0, jx = 0;
    if (act?.kind === 'stomp' && !act.fired) lift = -Math.round(act.t / ABIL.stomp.wind * 3);
    if (act?.kind === 'shake') { jx = (Math.floor(act.t * 30) % 2) ? 1 : -1; frame = Math.floor(act.t * 20) % 4; }
    const x = Math.round(b.x) - BOSS_SIZE / 2 + jx, y = Math.round(b.y) - BOSS_SIZE / 2;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(shadow, Math.round(b.x) - 14, Math.round(b.y) - 9);
    ctx.globalAlpha = 1;
    const spr = boss[dir][mouth * 4 + frame];
    if (b.evade) ctx.globalAlpha = (Math.floor(g.t * 12) % 2) ? 0.55 : 0.85;
    ctx.drawImage(spr, x, y + lift);
    if (b.dead) { ctx.globalAlpha = Math.min(0.6, b.deadT * 0.4); ctx.drawImage(tinted(spr, PAL.rock0), x, y); }
    else if (b.flash > 0) { ctx.globalAlpha = 0.55; ctx.drawImage(tinted(spr, '#ffffff'), x, y + lift); }
    ctx.globalAlpha = 1;
    // a taunt is a tether to the tank who did it
    if (b.taunt && !b.dead) {
      const u = b.taunt.u, n = Math.ceil(Math.hypot(u.x - b.x, u.y - b.y) / 2);
      ctx.fillStyle = PAL.red;
      for (let i = 1; i < n; i++) if ((i + Math.floor(g.t * 20)) % 3) ctx.fillRect(Math.round(b.x + (u.x - b.x) * i / n), Math.round(b.y + (u.y - b.y) * i / n), 1, 1);
    }
    // the weak spot on the back glows; it flares when someone is up there
    if (!b.dead) {
      const c = Math.cos(b.face), sn = Math.sin(b.face);
      const sx = Math.round(b.x - 4 * c), sy = Math.round(b.y - 4 * sn) + lift;
      const climbed = g.units.some(u => u.role === 'rider' && u.state === 'climb');
      const pulse = climbed ? (Math.floor(g.t * 8) % 2) : (Math.sin(g.t * 2.5) > 0.2 ? 1 : 0);
      ctx.fillStyle = PAL.sigil;
      ctx.globalAlpha = climbed ? 0.9 : 0.55 + pulse * 0.3;
      ctx.fillRect(sx, sy, 1, 1);
      if (pulse) { ctx.globalAlpha *= 0.5; ctx.fillRect(sx - 1, sy, 1, 1); ctx.fillRect(sx + 1, sy, 1, 1); ctx.fillRect(sx, sy - 1, 1, 1); ctx.fillRect(sx, sy + 1, 1, 1); }
      ctx.globalAlpha = 1;
    }
  }

  function reset() { tctx.clearRect(0, 0, W, H); }

  return { buf, render, reset, get fps() { return fps; } };
}

// ------------------------------------------------------------------------------------------------ the ground

function makeBackground() {
  const c = newCanvas(W, H), x = c.getContext('2d');
  const grass = [PAL.grass0, PAL.grass1, PAL.grass2, PAL.grass3];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const n = vnoise(px / 22, py / 22) * 0.55 + vnoise(px / 7 + 40, py / 7) * 0.3 + hash(px, py) * 0.2;
    const lvl = Math.max(0, Math.min(3, Math.floor(n * 3.4 - 0.35 + ((px + py) & 1) * 0.3)));
    x.fillStyle = grass[lvl];
    x.fillRect(px, py, 1, 1);
  }
  // the path, worn by a thousand years of pacing
  for (let py = 70; py < 130; py++) for (let px = A.x - 20; px < B.x + 20; px++) {
    const p = segNearest(px + 0.5, py + 0.5);
    const off = Math.sin(p.t * Math.PI * 4 + 0.6) * 1.8;
    const d = Math.hypot(px + 0.5 - p.x, py + 0.5 - (p.y + off));
    const w = 5.2 + vnoise(px / 6, 3.3) * 2.6;
    if (d > w + 1.5) continue;
    const n = vnoise(px / 3, py / 3) + hash(px * 3, py) * 0.4;
    if (d > w) { if (hash(px, py * 7) < 0.45) { x.fillStyle = PAL.dirt0; x.fillRect(px, py, 1, 1); } continue; }
    x.fillStyle = d > w - 1.3 ? PAL.dirt0 : n > 1.05 ? PAL.dirt3 : n > 0.7 ? PAL.dirt2 : PAL.dirt1;
    x.fillRect(px, py, 1, 1);
  }
  // tufts, pebbles, flowers
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    if (segDist(px, py) < 9) continue;
    x.fillStyle = r() < 0.5 ? PAL.tuft : PAL.tuftHi;
    x.fillRect(px, py, 1, 1);
    x.fillStyle = PAL.tuft; x.fillRect(px + (r() < 0.5 ? -1 : 1), py + 1, 1, 1);
  }
  for (let i = 0; i < 60; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    if (segDist(px, py) < 9) continue;
    x.fillStyle = [PAL.cream, PAL.yellow, PAL.pink, PAL.frost][Math.floor(r() * 4)];
    x.fillRect(px, py, 1, 1);
  }
  for (let i = 0; i < 40; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    x.fillStyle = PAL.rock1; x.fillRect(px, py, 1, 1);
    x.fillStyle = PAL.rock0; x.fillRect(px + 1, py + 1, 1, 1);
  }
  drawRock(x, A.x, A.y, 6.2, 1, 3);
  drawRock(x, B.x, B.y, 5.6, 2, 7);
  drawText(x, 'ROCK', A.x, A.y + 10, PAL.rock3, { align: 'center', alpha: 0.75 });
  drawText(x, 'OTHER ROCK', B.x, B.y + 10, PAL.rock3, { align: 'center', alpha: 0.75 });
  return c;
}

function drawRock(x, cx, cy, R, kind, sd) {
  const shapeR = a => R + (hash(Math.round((a + 4) * 3) + sd, sd) - 0.5) * 2.2 * (kind === 1 ? 1.4 : 0.8);
  const inside = (px, py) => { const dx = px - cx, dy = (py - cy) * (kind === 1 ? 1.15 : 1); return Math.hypot(dx, dy) < shapeR(Math.atan2(dy, dx)); };
  for (let py = cy - 12; py < cy + 12; py++) for (let px = cx - 12; px < cx + 12; px++) {
    if (inside(px - 2, py - 2) && !inside(px, py)) { x.fillStyle = 'rgba(10,14,8,.45)'; x.fillRect(px, py, 1, 1); }
  }
  for (let py = cy - 12; py < cy + 12; py++) for (let px = cx - 12; px < cx + 12; px++) {
    if (!inside(px, py)) continue;
    const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
    const l = (-(px - cx) * 0.6 - (py - cy) * 0.8) / R + hash(px * 5, py * 3) * 0.35;
    let col = edge ? PAL.ink : l > 0.75 ? PAL.rock4 : l > 0.25 ? PAL.rock3 : l > -0.3 ? PAL.rock2 : PAL.rock1;
    if (!edge && kind === 2 && l < 0.1 && hash(px, py * 9) < 0.45) col = PAL.moss;
    x.fillStyle = col; x.fillRect(px, py, 1, 1);
  }
}

// a ring of tree canopies round the clearing, drawn over everything that walks under them
function makeForeground() {
  const c = newCanvas(W, H), x = c.getContext('2d');
  const trees = [];
  let seed = 31;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let px = -6; px < W + 10; px += 11 + r() * 7) { trees.push([px, -4 + r() * 6, 8 + r() * 6]); trees.push([px + 5, H + 3 - r() * 6, 8 + r() * 6]); }
  for (let py = 10; py < H; py += 12 + r() * 7) { trees.push([-5 + r() * 5, py, 8 + r() * 5]); trees.push([W + 5 - r() * 5, py + 6, 8 + r() * 5]); }
  const cover = new Float32Array(W * H), owner = new Int16Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (px > 26 && px < W - 26 && py > 22 && py < H - 22) continue;
    let best = 0;
    trees.forEach((t, i) => {
      const dx = px - t[0], dy = py - t[1], d = Math.hypot(dx, dy);
      const rr = t[2] + (hash(Math.round((Math.atan2(dy, dx) + 4) * 5) + i * 13, i) - 0.5) * 2.5;
      const v = 1 - d / rr;
      if (v > best) { best = v; owner[py * W + px] = i; }
    });
    cover[py * W + px] = best;
  }
  const on = (px, py) => px < 0 || py < 0 || px >= W || py >= H || cover[py * W + px] > 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px;
    if (cover[i] <= 0) continue;
    const t = trees[owner[i]];
    const edge = !on(px - 1, py) || !on(px + 1, py) || !on(px, py - 1) || !on(px, py + 1);
    const l = (-(px - t[0]) * 0.55 - (py - t[1]) * 0.8) / t[2] + (hash(px * 3 + 1, py * 5) - 0.5) * 0.5;
    x.fillStyle = edge ? PAL.ink : l > 0.55 ? PAL.canopy3 : l > 0 ? PAL.canopy2 : l > -0.5 ? PAL.canopy1 : PAL.canopy0;
    x.fillRect(px, py, 1, 1);
  }
  return c;
}

function makeShadow() {
  const c = newCanvas(28, 22), x = c.getContext('2d');
  x.fillStyle = PAL.ink;
  for (let py = 0; py < 22; py++) for (let px = 0; px < 28; px++) {
    const dx = (px + 0.5 - 14) / 13, dy = (py + 0.5 - 12) / 10;
    if (dx * dx + dy * dy < 1) x.fillRect(px, py, 1, 1);
  }
  return c;
}

// ------------------------------------------------------------------------------------------------ world bits

function drawLeash(ctx, g) {
  const b = g.boss;
  const near = segDist(b.x, b.y);
  const a = Math.max(0, Math.min(1, (near - (LEASH - 28)) / 22));
  if (a <= 0 || b.dead) return;
  ctx.fillStyle = PAL.cream;
  ctx.globalAlpha = a * 0.5;
  for (let i = 0; i < 260; i++) {
    const t = i / 260;
    let px, py;
    // stadium outline: two straight sides, two half circles
    const len = B.x - A.x, arc = Math.PI * LEASH, per = 2 * len + 2 * arc, s = t * per;
    if (s < len) { px = A.x + s; py = A.y - LEASH; }
    else if (s < len + arc) { const k = (s - len) / LEASH - Math.PI / 2; px = B.x + Math.cos(k) * LEASH; py = B.y + Math.sin(k) * LEASH; }
    else if (s < 2 * len + arc) { px = B.x - (s - len - arc); py = A.y + LEASH; }
    else { const k = (s - 2 * len - arc) / LEASH + Math.PI / 2; px = A.x + Math.cos(k) * LEASH; py = A.y + Math.sin(k) * LEASH; }
    if (Math.hypot(px - b.x, py - b.y) < 60 && (i + Math.floor(g.t * 6)) % 3 === 0) ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawFires(ctx, g) {
  const fr = Math.floor(g.t * 10);
  for (const f of g.fires) {
    const fade = f.t < 0.25 ? f.t / 0.25 : f.t > f.life - 1.2 ? Math.max(0, (f.life - f.t) / 1.2) : 1;
    const R = Math.ceil(f.r);
    for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
      const d = Math.hypot(px, py) / f.r;
      if (d > 1) continue;
      const wx = Math.round(f.x) + px, wy = Math.round(f.y) + py;
      const h = hash(wx * 7 + fr * 31, wy * 13 + fr);
      if (h < 0.15 + d * 0.45 * (2 - fade)) continue;
      ctx.fillStyle = d < 0.35 && h > 0.6 ? PAL.fire3 : d < 0.6 ? PAL.fire2 : h > 0.7 ? PAL.fire1 : PAL.fire0;
      ctx.globalAlpha = fade;
      ctx.fillRect(wx, wy, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTelegraph(ctx, g) {
  const b = g.boss, a = b.act;
  if (!a || b.dead) return;
  const k = a.kind, d = ABIL[k];
  if (k === 'shake') return;
  if (k === 'roar') {
    if (a.fired) return;
    const rr = 6 + a.t / d.wind * 8;
    ring(ctx, b.x, b.y, rr, PAL.cream, 0.6);
    return;
  }
  if (a.fired && k !== 'breath') return;
  const prog = a.fired ? 1 : a.t / d.wind;
  const R = d.range, x0 = Math.max(0, Math.floor(b.x - R)), x1 = Math.min(W - 1, Math.ceil(b.x + R));
  const y0 = Math.max(0, Math.floor(b.y - R)), y1 = Math.min(H - 1, Math.ceil(b.y + R));
  const blink = Math.floor(g.t * (prog > 0.6 ? 24 : 10)) & 1;
  const half = d.arc / 2;
  const channel = a.fired;
  ctx.fillStyle = PAL.tele;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - b.x, dy = py + 0.5 - b.y, dist = Math.hypot(dx, dy);
    if (dist > R || dist < 8) continue;
    let edge = dist > R - 1;
    if (k !== 'stomp') {
      const ad = Math.abs(angDiff(Math.atan2(dy, dx), b.face));
      if (ad > half) continue;
      if ((half - ad) * dist < 1) edge = true;
    }
    let al;
    if (edge) al = channel ? 0.35 : 0.85;
    else if (dist < 8 + (R - 8) * prog) al = ((px + py + blink) & 1) ? (channel ? 0.12 : 0.42) : (channel ? 0.04 : 0.16);
    else al = ((px + py) & 1) ? 0.12 : 0;
    if (!al) continue;
    ctx.globalAlpha = al;
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function ring(ctx, cx, cy, r, col, alpha) {
  ctx.fillStyle = col;
  ctx.globalAlpha = alpha;
  const n = Math.max(12, Math.floor(r * 6.3));
  let lx = null, ly = null;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
  ctx.globalAlpha = 1;
}

function drawRing(ctx, r) {
  const k = r.t / 0.45;
  const rr = r.r + (r.max - r.r) * (1 - (1 - k) * (1 - k));
  if (r.col === 'dust') { ring(ctx, r.x, r.y, rr, PAL.dust, (1 - k) * 0.9); ring(ctx, r.x, r.y, rr * 0.8, PAL.dirt3, (1 - k) * 0.5); }
  else { ring(ctx, r.x, r.y, rr, PAL.cream, (1 - k) * 0.8); ring(ctx, r.x, r.y, rr * 0.7, PAL.cream, (1 - k) * 0.45); }
}

function drawSlash(ctx, r) {
  const k = r.t / 0.18;
  ctx.fillStyle = k < 0.5 ? '#ffffff' : PAL.cream;
  ctx.globalAlpha = 1 - k;
  for (let j = 0; j < 3; j++) {
    const rad = 17 + j * 4;
    for (let i = 0; i <= 18; i++) {
      const a = r.face - 0.95 + i / 18 * 1.9 + j * 0.08;
      if (i / 18 > k * 1.6 + 0.2) break;
      ctx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function px(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }

function drawUnit(ctx, u, g) {
  const b = g.boss;
  const x = Math.round(u.x), y = Math.round(u.y) - (u.dance ? Math.floor(u.dance * 7) % 2 : 0);
  const fx = u.moving ? u.fx : (b.x > u.x ? 1 : -1);
  const flash = u.hit > 0;
  const C = c => flash ? '#ffffff' : c;
  const col = C(PAL[CLASS[u.cls].col]);
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(x - 1, Math.round(u.y) + 1, 3, 1);
  if (u.role === 'pet') {
    const st = u.moving ? Math.floor(u.walk * 1.5) % 2 : 0;
    px(ctx, x - 1, y, C(PAL.ink)); px(ctx, x + 1, y - st, C(PAL.ink));
    ctx.fillStyle = col; ctx.fillRect(x - 1, y - 2, 3, 2);
    px(ctx, x + fx, y - 3, C(PAL.brown)); px(ctx, x + fx * 2, y - 2, C(PAL.ink));
    return;
  }
  const st = u.moving ? Math.floor(u.walk) % 2 : 2;
  if (st !== 0) px(ctx, x - 1, y, C(PAL.ink));
  if (st !== 1) px(ctx, x + 1, y, C(PAL.ink));
  const tall = u.role === 'tank' ? 3 : 2;
  ctx.fillStyle = col; ctx.fillRect(x - 1, y - tall, 3, tall);
  px(ctx, x, y - tall - 1, C(u.role === 'tank' ? PAL.steelHi : PAL.skin));
  if (u.role === 'tank') { ctx.fillStyle = C(PAL.steelHi); ctx.fillRect(x + fx * 2, y - 3, 1, 3); }
  else if (u.role === 'melee') {
    const sw = u.swing > 0;
    px(ctx, x + fx * 2, y - (sw ? 2 : 3), C(PAL.steelHi)); px(ctx, x + fx * (sw ? 3 : 2), y - (sw ? 2 : 4), C(PAL.steelHi));
  } else if (u.role === 'ranged') {
    const casting = u.cast > 0.3;
    if (u.cls === 'hunter') { ctx.fillStyle = C(PAL.tan); ctx.fillRect(x + fx * 2, y - 3, 1, 3); }
    else { ctx.fillStyle = C(PAL.brown); ctx.fillRect(x + fx * 2, y - 4, 1, 4); px(ctx, x + fx * 2, y - 5, C(casting && (Math.floor(g.t * 10) % 2) ? '#ffffff' : u.cls === 'mage' ? PAL.frost : PAL.shadow)); }
  } else if (u.role === 'healer') {
    px(ctx, x + fx * 2, y - 2, C(PAL.cream));
    if (u.glow > 0) { px(ctx, x, y - 5, PAL.heal); px(ctx, x - 1, y - 4, PAL.heal); px(ctx, x + 1, y - 4, PAL.heal); }
  }
  if (u.state === 'afk') { const z = Math.floor(g.t * 2) % 3; drawText(ctx, 'Z', x + 2 + z, y - 9 - z * 2, PAL.cream, { shadow: false, alpha: 0.7 }); }
  if (u.inFire && u.fireOk) px(ctx, x, y - tall - 2, PAL.fire2);
  if (u.hp < u.maxhp && u.party.engaged) {
    const w = Math.max(0, Math.ceil(3 * u.hp / u.maxhp));
    ctx.fillStyle = PAL.hpBg; ctx.fillRect(x - 1, y - tall - 3, 3, 1);
    ctx.fillStyle = u.hp / u.maxhp > 0.4 ? PAL.heal : PAL.red; ctx.fillRect(x - 1, y - tall - 3, w, 1);
  }
}

// a horse seen from above, sampled at its heading
function drawHorse(ctx, hx, hy, face, walk, rider, t) {
  const c = Math.cos(face), s = Math.sin(face);
  const gait = Math.floor(walk / 1.6) % 4;
  const cx = Math.round(hx), cy = Math.round(hy);
  const mat = (lx, ly) => {
    if (Math.hypot(lx - 5, ly) < 1.25) return 'head';
    if (Math.abs(ly) < 0.7 && lx > 1 && lx < 4.4) return 'mane';
    if (Math.abs(ly) < 1.1 && lx > 2 && lx < 5) return 'body';
    if ((lx / 3.6) ** 2 + (ly / 1.9) ** 2 < 1) return 'body';
    if (Math.hypot(lx + 4.4, ly) < 1) return 'mane';
    const ph = [0, 1, 0, -1][gait];
    for (const [fx, sy, sw] of [[2.3, 1, 1], [2.3, -1, -1], [-2.4, 1, -1], [-2.4, -1, 1]]) if (Math.hypot(lx - fx - ph * sw, ly - sy * 2) < 0.75) return 'leg';
    return null;
  };
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(cx - 3, cy + 2, 7, 1);
  const cells = [];
  for (let py = -7; py <= 7; py++) for (let qx = -7; qx <= 7; qx++) {
    const lx = qx * c + py * s, ly = -qx * s + py * c;
    const m = mat(lx, ly);
    if (m) cells.push([qx, py, m]);
  }
  const has = new Set(cells.map(([a, b]) => a + ',' + b));
  for (const [qx, py, m] of cells) {
    const edge = m !== 'leg' && (!has.has((qx - 1) + ',' + py) || !has.has((qx + 1) + ',' + py) || !has.has(qx + ',' + (py - 1)) || !has.has(qx + ',' + (py + 1)));
    px(ctx, cx + qx, cy + py - 1, edge ? PAL.ink : m === 'mane' ? PAL.mane : m === 'leg' ? PAL.horseD : PAL.horse);
  }
}

function drawRider(ctx, u, g) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const flash = u.hit > 0, C = c => flash ? '#ffffff' : c;
  if (u.mounted) {
    drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, true, g.t);
    px(ctx, x, y - 2, C(PAL.tan)); px(ctx, x - 1, y - 2, C(PAL.tan)); px(ctx, x, y - 3, C(PAL.hair));
    px(ctx, x + (Math.cos(u.horse.face) > 0 ? 1 : -1), y - 3, C(Math.floor(g.t * 3) % 4 ? PAL.steel : '#ffffff'));
    return;
  }
  if (u.state === 'flung' || u.state === 'stun') {
    ctx.fillStyle = C(PAL.tan); ctx.fillRect(x - 1, y - 1, 3, 1);
    px(ctx, x + 2, y - 1, C(PAL.hair));
    if (u.state === 'stun') {
      const a = g.t * 6;
      px(ctx, Math.round(x + Math.cos(a) * 3), Math.round(y - 4 + Math.sin(a)), PAL.gold);
      px(ctx, Math.round(x + Math.cos(a + Math.PI) * 3), Math.round(y - 4 + Math.sin(a + Math.PI)), PAL.gold);
    }
    return;
  }
  const st = u.moving ? Math.floor(u.walk) % 2 : 2;
  if (st !== 0) px(ctx, x - 1, y, PAL.ink);
  if (st !== 1) px(ctx, x + 1, y, PAL.ink);
  ctx.fillStyle = C(PAL.tan); ctx.fillRect(x - 1, y - 2, 3, 2);
  px(ctx, x, y - 3, C(PAL.hair));
  px(ctx, x + u.fx * 2, y - 3, C(PAL.steelHi));
}

function drawClimber(ctx, u, g) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const wig = Math.floor(u.walk) % 2;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1 - wig, y - 3, 4, 5);
  ctx.fillStyle = PAL.tan; ctx.fillRect(x - wig, y - 1, 2, 2);
  px(ctx, x + 1 - wig, y - 2, PAL.skin); px(ctx, x - wig, y - 2, PAL.hair);
  if (u.stab > 0) { px(ctx, x - 1, y - 2, '#ffffff'); px(ctx, x - 2, y - 3, PAL.sigil); }
  else px(ctx, x + 2 - wig, y - 1, PAL.steelHi);
  // grip meter
  const w = 12, gx = Math.round(g.boss.x) - 6, gy = Math.round(g.boss.y) - 22;
  ctx.fillStyle = PAL.ink; ctx.fillRect(gx - 1, gy - 1, w + 2, 3);
  ctx.fillStyle = PAL.gold; ctx.fillRect(gx, gy, Math.max(0, Math.round(w * u.grip / 100)), 1);
}

function drawCorpse(ctx, c) {
  const a = c.t > 30 ? (40 - c.t) / 10 : 1;
  ctx.globalAlpha = Math.max(0, a) * 0.85;
  const x = Math.round(c.x), y = Math.round(c.y);
  ctx.fillStyle = PAL[CLASS[c.cls].col]; ctx.fillRect(x - 1, y - 1, c.cls === 'pet' ? 2 : 3, 1);
  px(ctx, x + 2, y - 1, c.cls === 'pet' ? PAL.brown : PAL.skin);
  px(ctx, x, y, PAL.blood);
  if (c.t < 8) px(ctx, x - 1, y, PAL.blood);
  ctx.globalAlpha = 1;
}

function drawGhost(ctx, o) {
  const a = (1 - o.t / 3.5) * 0.7;
  ctx.globalAlpha = a;
  const x = Math.round(o.x + Math.sin(o.t * 4) * 1.2), y = Math.round(o.y);
  ctx.fillStyle = PAL.ghost; ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x - 1, y - 1, 3, 2);
  px(ctx, x - 1, y + 1, PAL.ghost); px(ctx, x + 1, y + 1, PAL.ghost);
  ctx.globalAlpha = 1;
}

function drawBolt(ctx, o) {
  const col = PAL[o.kind];
  const x = Math.round(o.x), y = Math.round(o.y);
  const l = Math.hypot(o.vx || 0, o.vy || 0) || 1;
  px(ctx, x, y, col);
  ctx.globalAlpha = 0.6; px(ctx, Math.round(o.x - o.vx / l * 1.5), Math.round(o.y - o.vy / l * 1.5), col); ctx.globalAlpha = 1;
  if (o.kind === 'arrow') px(ctx, Math.round(o.x - o.vx / l * 2.5), Math.round(o.y - o.vy / l * 2.5), PAL.tan);
}

function drawPart(ctx, p) {
  const k = p.t / p.life;
  let col = PAL[p.kind] || p.kind;
  if (p.kind === 'flame') col = k < 0.3 ? PAL.fire3 : k < 0.6 ? PAL.fire2 : PAL.fire1;
  ctx.globalAlpha = p.kind === 'heal' || p.kind === 'dust' ? 1 - k : 1;
  px(ctx, Math.round(p.x), Math.round(p.y), col);
  ctx.globalAlpha = 1;
}

function bubble(ctx, s, x, y, bg, fg, alpha = 1) {
  const w = textWidth(s);
  const bx = Math.max(2, Math.min(W - w - 6, Math.round(x - w / 2 - 2))), by = Math.max(2, Math.round(y));
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle = bg; ctx.fillRect(bx, by, w + 4, 7);
  ctx.fillRect(Math.round(x), by + 7, 1, 1);
  ctx.globalAlpha = 1;
  drawText(ctx, s, bx + 2, by + 1, fg, { shadow: false, alpha });
}

function drawBark(ctx, k) {
  const a = k.t < 0.1 ? k.t / 0.1 : k.t > k.life - 0.3 ? (k.life - k.t) / 0.3 : 1;
  bubble(ctx, k.s, k.x, k.y - 14, PAL.ink, PAL.cream, a);
}

function drawThought(ctx, g) {
  const b = g.boss, t = g.thought;
  const a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.1 ? (2.4 - t.t) / 0.3 : 1;
  bubble(ctx, t.s, b.x, b.y - 32, PAL.cream, PAL.ink, a);
  ctx.globalAlpha = a * 0.8; ctx.fillStyle = PAL.cream;
  ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) - 22, 1, 1);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ HUD

function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function drawHud(ctx, g, view) {
  const b = g.boss;
  drawText(ctx, fmt(g.score), 4, 3, PAL.cream, { scale: 2 });
  const mc = g.mult >= 4 ? PAL.gold : g.mult >= 2 ? PAL.yellow : PAL.cream;
  drawText(ctx, `AIMLESS X${g.mult.toFixed(2)}`, 4, 15, mc);
  drawText(ctx, `LAPS ${g.laps}  KILLS ${g.kills}`, 4, 22, PAL.rock3);

  // the target frame, as the adventurers see it
  drawText(ctx, b.name, W - 4, 3, PAL.cream, { align: 'right' });
  const bw = 100, bx = W - 4 - bw, by = 10;
  ctx.fillStyle = PAL.ink; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
  ctx.fillStyle = PAL.hpBg; ctx.fillRect(bx, by, bw, 5);
  const fw = Math.round(bw * b.hp / b.maxhp);
  ctx.fillStyle = PAL.hpLo; ctx.fillRect(bx, by, fw, 5);
  ctx.fillStyle = PAL.hpHi; ctx.fillRect(bx, by, fw, 3);
  if (b.flash > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + fw - 1, by, 1, 5); }
  ctx.fillStyle = PAL.ink;
  for (let i = 1; i < 10; i++) ctx.fillRect(bx + i * 10, by + 4, 1, 1);
  drawText(ctx, `${Math.ceil(b.hp)} / ${b.maxhp}`, W - 4, 17, PAL.rock3, { align: 'right' });

  // patrol status
  const blink = Math.floor(g.t * 3) % 2;
  if (b.dead) drawText(ctx, 'DEFEATED', 4, 170, PAL.red);
  else if (b.evade) drawText(ctx, 'EVADING...', 4, 170, PAL.cream, { alpha: blink ? 1 : 0.5 });
  else if (g.onPatrol) drawText(ctx, 'ON PATROL', 4, 170, PAL.tuftHi);
  else drawText(ctx, g.offLane > 3 ? 'AIMLESSNESS FADING' : 'OFF THE PATH', 4, 170, PAL.red, { alpha: blink ? 1 : 0.6 });
  const m = Math.floor(g.t / 60), s = Math.floor(g.t % 60);
  drawText(ctx, `${m}:${String(s).padStart(2, '0')}`, W - 4, 170, PAL.rock3, { align: 'right' });
  if (view.muted) drawText(ctx, 'MUTED', W - 4, 163, PAL.rock2, { align: 'right' });

  // abilities
  const n = ORDER.length, bs = 14, gap = 3, x0 = Math.round(W / 2 - (n * bs + (n - 1) * gap) / 2), y0 = 160;
  ORDER.forEach((k, i) => {
    const x = x0 + i * (bs + gap), cd = b.cd[k], max = ABIL[k].cd, ready = cd <= 0 && !b.dead;
    const active = b.act?.kind === k;
    ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.8; ctx.fillRect(x, y0, bs, bs); ctx.globalAlpha = 1;
    ctx.fillStyle = active ? PAL.gold : ready ? PAL.rock3 : PAL.rock1;
    ctx.fillRect(x, y0, bs, 1); ctx.fillRect(x, y0 + bs - 1, bs, 1); ctx.fillRect(x, y0, 1, bs); ctx.fillRect(x + bs - 1, y0, 1, bs);
    ctx.fillStyle = ready ? (active ? PAL.gold : PAL.cream) : PAL.rock2;
    ICONS[k].forEach((row, r) => { for (let c = 0; c < 8; c++) if (row[c] === '#') ctx.fillRect(x + 3 + c, y0 + 3 + r, 1, 1); });
    if (cd > 0) {
      const h = Math.ceil((bs - 2) * cd / max);
      ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.6; ctx.fillRect(x + 1, y0 + 1, bs - 2, h); ctx.globalAlpha = 1;
      if (cd > 1) drawText(ctx, String(Math.ceil(cd)), x + bs / 2 + 1, y0 + 5, PAL.cream, { align: 'center' });
    }
    drawText(ctx, KEYS[k], x + bs / 2 + 1, y0 + bs + 1, PAL.rock3, { align: 'center', shadow: false });
  });

  const climber = g.units.find(u => u.role === 'rider' && u.state === 'climb');
  if (climber && !b.dead) drawText(ctx, 'HE IS IN YOUR FUR! SHAKE! [SPACE]', W / 2, 151, PAL.gold, { align: 'center', alpha: blink ? 1 : 0.55 });
  else if (b.taunt) drawText(ctx, 'TAUNTED', W / 2, 151, PAL.red, { align: 'center' });

  if (g.banner) {
    const t = g.banner.t, d = g.banner.dur;
    const a = t < 0.2 ? t / 0.2 : t > d - 0.5 ? Math.max(0, (d - t) / 0.5) : 1;
    drawText(ctx, g.banner.s, W / 2, 34, PAL.cream, { scale: 2, align: 'center', alpha: a });
    if (g.banner.sub) drawText(ctx, g.banner.sub, W / 2, 47, PAL.rock4, { align: 'center', alpha: a });
  }
}

function drawCursor(ctx, mx, my, g) {
  const x = Math.round(mx), y = Math.round(my);
  const col = g.boss.act ? PAL.gold : PAL.cream;
  for (const [dx, dy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) {
    ctx.fillStyle = PAL.ink; ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1);
  }
  for (const [dx, dy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) px(ctx, x + dx, y + dy, col);
}
