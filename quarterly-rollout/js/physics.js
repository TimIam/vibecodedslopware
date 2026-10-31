// Circle-against-tile collision for chairs, robots and coworkers.

import { TILE } from './config.js';

// How far a circle overlaps a rectangle, and which way to push it out (null when they don't touch).
export function circleRectPenetration(cx, cy, r, rx, ry, rw, rh) {
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - px, dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // centre is inside the rectangle: leave through the nearest side
  const left = cx - rx, right = rx + rw - cx, top = cy - ry, bottom = ry + rh - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + r };
  if (m === right) return { nx: 1, ny: 0, depth: right + r };
  if (m === top) return { nx: 0, ny: -1, depth: top + r };
  return { nx: 0, ny: 1, depth: bottom + r };
}

// Push a body {x, y, vx, vy, r} out of every solid tile it overlaps. Velocity heading into a wall is
// reflected, keeping `restitution` of it. Returns the hardest impact speed (0 when nothing was hit).
export function resolveTiles(body, isSolid, restitution) {
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) {
    const c0 = Math.floor((body.x - body.r) / TILE), c1 = Math.floor((body.x + body.r) / TILE);
    const r0 = Math.floor((body.y - body.r) / TILE), r1 = Math.floor((body.y + body.r) / TILE);
    let moved = false;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!isSolid(col, row)) continue;
        const p = circleRectPenetration(body.x, body.y, body.r, col * TILE, row * TILE, TILE, TILE);
        if (!p) continue;
        body.x += p.nx * p.depth;
        body.y += p.ny * p.depth;
        moved = true;
        const vn = body.vx * p.nx + body.vy * p.ny;
        if (vn < 0) {
          body.vx -= (1 + restitution) * vn * p.nx;
          body.vy -= (1 + restitution) * vn * p.ny;
          impact = Math.max(impact, -vn);
        }
      }
    }
    if (!moved) break;
  }
  return impact;
}

export function overlapsSolid(x, y, r, isSolid) {
  const c0 = Math.floor((x - r) / TILE), c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE), r1 = Math.floor((y + r) / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (isSolid(col, row) && circleRectPenetration(x, y, r, col * TILE, row * TILE, TILE, TILE)) return true;
    }
  }
  return false;
}
