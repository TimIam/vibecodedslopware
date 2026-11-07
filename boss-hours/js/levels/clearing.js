// Level 1, the Clearing: the original rock-to-rock patrol. The leash is marked out on the ground as a henge, a ring of
// small standing stones and cairns, with trees standing just outside it.

import { drawTree } from './forest.js';

const TAU = Math.PI * 2;

// walks the leash outline (a stadium round the straight path) and hands back points spaced `step` apart
function leashRing(m, leash, step) {
  const { A, B } = m, len = B.x - A.x, arc = Math.PI * leash, per = 2 * len + 2 * arc, out = [];
  for (let s = 0; s < per; s += step) {
    let x, y, nx, ny;
    if (s < len) { x = A.x + s; y = A.y - leash; nx = 0; ny = -1; }
    else if (s < len + arc) { const k = (s - len) / leash - Math.PI / 2; x = B.x + Math.cos(k) * leash; y = B.y + Math.sin(k) * leash; nx = Math.cos(k); ny = Math.sin(k); }
    else if (s < 2 * len + arc) { x = B.x - (s - len - arc); y = A.y + leash; nx = 0; ny = 1; }
    else { const k = (s - 2 * len - arc) / leash + Math.PI / 2; x = A.x + Math.cos(k) * leash; y = A.y + Math.sin(k) * leash; nx = Math.cos(k); ny = Math.sin(k); }
    out.push({ x, y, nx, ny });
  }
  return out;
}

const STONE = ['#3f403a', '#6b6c63', '#8f8f84', '#b9b7a6'];
function standingStone(ctx, x, y, tall, hash, seed) {
  ctx.fillStyle = 'rgba(8,10,6,.45)'; ctx.fillRect(x - 1, y + 1, 4, 1);
  ctx.fillStyle = '#14100c'; ctx.fillRect(x - 1, y - tall - 1, 4, tall + 2);
  for (let j = 0; j < tall; j++) for (let i = 0; i < 2; i++) {
    const l = (i === 0 ? 0.5 : -0.1) + (j < 2 ? 0.3 : 0) + (hash(x * 7 + i + seed, y + j) - 0.5) * 0.5;
    ctx.fillStyle = l > 0.6 ? STONE[3] : l > 0.2 ? STONE[2] : STONE[1];
    ctx.fillRect(x + i, y - tall + j, 1, 1);
  }
  if (hash(seed, 3) < 0.3) { ctx.fillStyle = '#4f6a32'; ctx.fillRect(x + 1, y - 1, 1, 1); }
}
function cairn(ctx, x, y, hash, seed) {
  ctx.fillStyle = 'rgba(8,10,6,.45)'; ctx.fillRect(x - 2, y + 1, 6, 1);
  const rocks = [[-2, 0, 2], [1, 0, 2], [-1, -2, 2], [0, -4, 1]];
  for (const [dx, dy, s] of rocks) { ctx.fillStyle = '#14100c'; ctx.fillRect(x + dx - 1, y + dy - 1, s + 2, s + 1); }
  for (const [dx, dy, s] of rocks) { ctx.fillStyle = STONE[2]; ctx.fillRect(x + dx, y + dy - 1, s, s); ctx.fillStyle = STONE[3]; ctx.fillRect(x + dx, y + dy - 1, 1, 1); }
}

// draws the henge and the trees into the level's ground picture (they are scenery here, not props)
function decorate(ctx, m, h) {
  const ring = leashRing(m, 60, 9);
  ring.forEach((p, i) => {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x < 3 || x > 316 || y < 40 || y > 160) return;
    if (i % 4 === 2) cairn(ctx, x, y, h.hash, i);
    else standingStone(ctx, x, y, i % 4 === 0 ? 4 : 3, h.hash, i);
  });
  // trees just outside the stones, wherever the screen has room for them
  let k = 0;
  for (const p of leashRing(m, 74, 15)) {
    const out = 4 + h.hash(k, 9) * 8, x = p.x + p.nx * out, y = p.y + p.ny * out;
    k++;
    if (x < 6 || x > 314 || y < 46 || y > 156) continue;
    drawTree(ctx, { x, y, seed: k * 7, burning: false, hitT: 0 }, null, h, k % 3 ? 'pine' : 'oak');
  }
}

export default {
  n: 1, id: 'clearing', name: 'THE CLEARING', sub: 'WALK BETWEEN THE ROCKS. DO NOT LEAVE THE HENGE.', mode: 'patrol',
  art: { decorate, canopy: true, theme: { leash: true } },
};
