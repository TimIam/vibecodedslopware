// Game state for one floor and the fixed-step rules that advance it. No DOM, canvas or audio here:
// stepWorld() records what happened in world.events and the page turns those into sound and pictures.

import { TILE, PLAYER, SPIN, FLOORS, BOT, CARL, PRINTER, DRAFT, BUMP_SOUND_SPEED } from './config.js';
import { LEVELS, parseLevel } from './levels.js';
import { resolveTiles, overlapsSolid, circleRectPenetration } from './physics.js';

export function createWorld(levelIndex, opts = {}) {
  const def = LEVELS[levelIndex];
  if (!def) throw new Error('No such level: ' + levelIndex);
  const lv = parseLevel(def);
  return {
    levelIndex, def,
    cols: lv.cols, rows: lv.rows, tiles: lv.tiles,
    player: {
      x: lv.start.x, y: lv.start.y, vx: 0, vy: 0, r: PLAYER.radius, angle: 0,
      composure: PLAYER.maxComposure, invuln: 0, spin: 0, spinCd: 0, wheel: 0,
    },
    pages: lv.pages, coffees: lv.coffees, bots: lv.bots, carls: lv.carls, printers: lv.printers,
    exits: lv.exits, wads: [],
    pagesLeft: lv.pages.length, exitOpen: lv.pages.length === 0,
    time: 0, status: 'playing', events: [], shake: 0,
    hazards: opts.hazards !== false,
  };
}

export function tileAt(w, col, row) {
  return (w.tiles[row] || [])[col] || null;
}

export function tileAtPoint(w, x, y) {
  return tileAt(w, Math.floor(x / TILE), Math.floor(y / TILE));
}

// Walls, desks, plants, printers, anything off the map, and the elevator until it opens.
export function isSolid(w, col, row) {
  const t = tileAt(w, col, row);
  if (!t) return true;
  return t.solid || (t.kind === 'exit' && !w.exitOpen);
}

const len = (x, y) => Math.hypot(x, y);
const emit = (w, type, data = {}) => { w.events.push({ type, ...data }); };

// Lose one composure, unless spinning or still recovering from the last hit.
export function hurt(w, fromX, fromY, cause) {
  const p = w.player;
  if (p.invuln > 0 || p.spin > 0 || w.status !== 'playing') return false;
  p.composure -= 1;
  p.invuln = PLAYER.invuln;
  let dx = p.x - fromX, dy = p.y - fromY, d = len(dx, dy);
  if (d < 1e-6) { dx = -p.vx; dy = -p.vy; d = len(dx, dy) || 1; if (d === 1 && !dx && !dy) dx = 1; }
  p.vx = (dx / d) * PLAYER.knockback;
  p.vy = (dy / d) * PLAYER.knockback;
  w.shake = Math.max(w.shake, 0.25);
  emit(w, 'hurt', { cause });
  if (p.composure <= 0) { p.composure = 0; w.status = 'failed'; emit(w, 'fail', { cause }); }
  return true;
}

// input: { x, y } push direction (each -1..1) and spin: true on the step the spin key was pressed.
export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  w.time += dt;
  w.shake = Math.max(0, w.shake - dt);
  const p = w.player;
  const solid = (c, r) => isSolid(w, c, r);

  let ix = input.x || 0, iy = input.y || 0;
  const il = len(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }

  const tile = tileAtPoint(w, p.x, p.y);
  const floor = FLOORS[tile ? tile.floor : 'carpet'];

  // push off with the feet; slick floors give less grip
  p.vx += ix * PLAYER.thrust * floor.grip * dt;
  p.vy += iy * PLAYER.thrust * floor.grip * dt;
  if (tile && tile.draft) {
    p.vx += tile.draft[0] * DRAFT.accel * dt;
    p.vy += tile.draft[1] * DRAFT.accel * dt;
  }

  // spin: a burst of speed, and a moment where nothing can touch you
  p.spinCd = Math.max(0, p.spinCd - dt);
  p.spin = Math.max(0, p.spin - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (input.spin && p.spinCd <= 0) {
    let dx = ix, dy = iy;
    if (!dx && !dy) { const s = len(p.vx, p.vy); if (s > 5) { dx = p.vx / s; dy = p.vy / s; } else { dx = Math.cos(p.angle); dy = Math.sin(p.angle); } }
    const dl = len(dx, dy) || 1;
    p.vx += (dx / dl) * SPIN.impulse;
    p.vy += (dy / dl) * SPIN.impulse;
    p.spin = SPIN.duration;
    p.spinCd = SPIN.cooldown;
    emit(w, 'spin');
  }

  const k = Math.exp(-floor.drag * dt);
  p.vx *= k; p.vy *= k;
  const cap = PLAYER.maxSpeed * (p.spin > 0 ? SPIN.speedBonus : 1);
  const sp = len(p.vx, p.vy);
  if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }

  // move in small slices so a fast chair can't tunnel through a wall
  const slices = Math.max(1, Math.ceil((len(p.vx, p.vy) * dt) / 4));
  let impact = 0;
  for (let i = 0; i < slices; i++) {
    p.x += (p.vx * dt) / slices;
    p.y += (p.vy * dt) / slices;
    impact = Math.max(impact, resolveTiles(p, solid, PLAYER.restitution));
  }
  if (impact > BUMP_SOUND_SPEED) {
    emit(w, 'bump', { strength: Math.min(1, impact / PLAYER.maxSpeed) });
    if (impact > 260) w.shake = Math.max(w.shake, 0.12);
  }
  const moving = len(p.vx, p.vy);
  if (moving > 20) p.angle = Math.atan2(p.vy, p.vx);
  p.wheel += moving * dt;

  collectPickups(w);
  if (w.hazards) stepHazards(w, dt);
  if (w.status === 'playing' && w.exitOpen && touchingExit(w)) {
    w.status = 'complete';
    emit(w, 'complete', { time: w.time });
  }
}

function collectPickups(w) {
  const p = w.player;
  const reach = p.r + PLAYER.pickupReach;
  for (const pg of w.pages) {
    if (pg.taken || len(pg.x - p.x, pg.y - p.y) > reach) continue;
    pg.taken = true;
    w.pagesLeft -= 1;
    emit(w, 'page', { left: w.pagesLeft });
    if (w.pagesLeft === 0 && !w.exitOpen) { w.exitOpen = true; emit(w, 'exitOpen'); }
  }
  for (const c of w.coffees) {
    if (c.taken || p.composure >= PLAYER.maxComposure || len(c.x - p.x, c.y - p.y) > reach) continue;
    c.taken = true;
    p.composure += 1;
    emit(w, 'coffee');
  }
}

export function touchingExit(w) {
  const p = w.player;
  return w.exits.some((e) => circleRectPenetration(p.x, p.y, p.r + 2, e.col * TILE, e.row * TILE, TILE, TILE));
}

function stepHazards(w, dt) {
  const p = w.player;
  const solid = (c, r) => isSolid(w, c, r);

  const under = tileAtPoint(w, p.x, p.y);
  if (under && under.tacks) hurt(w, p.x + p.vx, p.y + p.vy, 'tacks'); // knocked back the way it came

  for (const b of w.bots) {
    if (b.stun > 0) b.stun = Math.max(0, b.stun - dt);
    else {
      const nx = b.x + b.dx * BOT.speed * dt, ny = b.y + b.dy * BOT.speed * dt;
      if (overlapsSolid(nx, ny, BOT.radius, solid)) { b.dx = -b.dx; b.dy = -b.dy; }
      else { b.x = nx; b.y = ny; }
    }
    if (len(b.x - p.x, b.y - p.y) < BOT.radius + p.r) {
      if (p.spin > 0) {
        if (b.stun <= 0) emit(w, 'stun', { who: 'bot' });
        b.stun = BOT.stun;
        bounceOff(p, b.x, b.y, 160);
      } else if (b.stun <= 0) hurt(w, b.x, b.y, 'bot');
    }
  }

  for (const c of w.carls) {
    c.say = Math.max(0, c.say - dt);
    const dx = p.x - c.x, dy = p.y - c.y, d = len(dx, dy) || 1;
    let vx = 0, vy = 0;
    if (c.stun > 0) c.stun = Math.max(0, c.stun - dt);
    else if (c.cooldown > 0) { c.cooldown = Math.max(0, c.cooldown - dt); vx = (-dx / d) * CARL.speed * 0.6; vy = (-dy / d) * CARL.speed * 0.6; }
    else if (d < CARL.sight) { vx = (dx / d) * CARL.speed; vy = (dy / d) * CARL.speed; }
    if (vx || vy) {
      const body = { x: c.x + vx * dt, y: c.y + vy * dt, vx, vy, r: CARL.radius };
      resolveTiles(body, solid, 0);
      c.x = body.x; c.y = body.y;
    }
    if (len(p.x - c.x, p.y - c.y) < CARL.radius + p.r) {
      if (p.spin > 0) {
        if (c.stun <= 0) emit(w, 'stun', { who: 'carl' });
        c.stun = CARL.stun;
        const body = { x: c.x - (dx / d) * 18, y: c.y - (dy / d) * 18, vx: 0, vy: 0, r: CARL.radius };
        resolveTiles(body, solid, 0);
        c.x = body.x; c.y = body.y;
        bounceOff(p, c.x, c.y, 120);
      } else if (c.stun <= 0 && c.cooldown <= 0) {
        if (hurt(w, c.x, c.y, 'carl')) {
          c.cooldown = CARL.cooldown;
          c.say = CARL.say;
          c.line += 1;
          emit(w, 'carl');
        }
      }
    }
  }

  for (const pr of w.printers) {
    pr.timer -= dt;
    if (pr.timer > 0) continue;
    pr.timer += PRINTER.period;
    const dx = p.x - pr.x, dy = p.y - pr.y, d = len(dx, dy);
    if (d > PRINTER.range || d < 1) continue;
    const ux = dx / d, uy = dy / d, off = TILE * 0.75 + PRINTER.wadRadius;
    const sx = pr.x + ux * off, sy = pr.y + uy * off;
    if (overlapsSolid(sx, sy, PRINTER.wadRadius, solid)) continue;
    w.wads.push({ x: sx, y: sy, vx: ux * PRINTER.wadSpeed, vy: uy * PRINTER.wadSpeed, life: PRINTER.wadLife });
    pr.flash = 0.25;
    emit(w, 'print');
  }
  for (const pr of w.printers) if (pr.flash) pr.flash = Math.max(0, pr.flash - dt);

  w.wads = w.wads.filter((wd) => {
    wd.x += wd.vx * dt; wd.y += wd.vy * dt; wd.life -= dt;
    if (wd.life <= 0 || overlapsSolid(wd.x, wd.y, PRINTER.wadRadius, solid)) return false;
    if (len(wd.x - p.x, wd.y - p.y) < PRINTER.wadRadius + p.r) {
      if (p.spin > 0) { emit(w, 'deflect'); return false; }
      if (hurt(w, wd.x - wd.vx, wd.y - wd.vy, 'paper')) return false;
    }
    return true;
  });
}

function bounceOff(p, fromX, fromY, speed) {
  const dx = p.x - fromX, dy = p.y - fromY, d = len(dx, dy) || 1;
  p.vx += (dx / d) * speed;
  p.vy += (dy / d) * speed;
}

// Seconds -> "1:05.3"
export function formatTime(s) {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60), r = t - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

export function rating(seconds, par) {
  if (seconds <= par) return 'Promotion material';
  if (seconds <= par * 1.5) return 'Meets expectations';
  return 'Needs improvement';
}
