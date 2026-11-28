// Shared in-stage HUD pieces so every minigame reads the same: a top bar, hearts, floating
// score pops, particles, and an on-beat pulse lamp.
import { W, H, P, rect, px, mix, ellipse, ring } from './gfx.js';
import { text, measure } from './font.js';
import { HEART } from './art.js';

// 12px strip across the top: stage name left, score right, anything in the middle.
export function topBar(g, left, right = '', mid = '') {
  rect(g, 0, 0, W, 12, P.ink); rect(g, 0, 12, W, 1, P.s0);
  text(g, left, 4, 3, P.amber);
  if (right !== '') text(g, String(right), W - 4, 3, P.cream, { align: 'right' });
  if (mid) text(g, mid, W / 2, 3, P.s3, { align: 'center' });
}

export function hearts(g, n, max, x, y) {
  for (let i = 0; i < max; i++) {
    if (i < n) g.drawImage(HEART, x + i * 10, y);
    else { g.globalAlpha = 0.25; g.drawImage(HEART, x + i * 10, y); g.globalAlpha = 1; }
  }
}

// A thin meter with a label.
export function bar(g, x, y, w, v, col, label = '') {
  rect(g, x - 1, y - 1, w + 2, 6, P.ink); rect(g, x, y, w, 4, P.s0);
  rect(g, x, y, Math.round(w * Math.max(0, Math.min(1, v))), 4, col);
  rect(g, x, y, Math.round(w * Math.max(0, Math.min(1, v))), 1, mix(col, P.white, 0.4));
  if (label) text(g, label, x - 3, y - 1, P.s3, { align: 'right' });
}

// Floating text: pops.add('+100', x, y, color); pops.update(dt); pops.draw(g).
export function Pops() {
  const list = [];
  return {
    add(s, x, y, c = P.cream, life = 0.8) { list.push({ s, x, y, c, t: 0, life }); },
    update(dt) { for (const p of list) { p.t += dt; p.y -= dt * 18; } for (let i = list.length - 1; i >= 0; i--) if (list[i].t > list[i].life) list.splice(i, 1); },
    draw(g) { for (const p of list) { if (p.t > p.life * 0.7 && (p.t * 20 | 0) % 2) continue; text(g, p.s, p.x, p.y, p.c, { align: 'center', shadow: P.ink }); } },
  };
}

// Square pixel particles with gravity.
export function Particles() {
  const list = [];
  return {
    burst(x, y, n, cols, sp = 60, life = 0.6, grav = 120) {
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.3 + Math.random() * 0.7); list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, c: cols[i % cols.length], t: 0, life: life * (0.6 + Math.random() * 0.6), g: grav, s: Math.random() < 0.3 ? 2 : 1 }); }
    },
    update(dt) { for (const p of list) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; } for (let i = list.length - 1; i >= 0; i--) if (list[i].t > list[i].life) list.splice(i, 1); },
    draw(g) { for (const p of list) { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } },
    get count() { return list.length; },
  };
}

// A lamp that flashes on every beat (b = ctx.beat()). Helps players feel the pulse.
export function beatLamp(g, x, y, b, col = P.magenta) {
  const f = b - Math.floor(b), on = f < 0.18, bar = Math.floor(b) % 4 === 0;
  ellipse(g, x, y, 4, 4, P.ink);
  ellipse(g, x, y, 3, 3, on ? (bar ? P.white : col) : mix(col, P.ink, 0.7));
  if (on) ring(g, x, y, 6 + f * 20, col);
}

// Centered banner text, e.g. "SPEED UP!".
export function banner(g, s, y, col = P.amber, bg = P.ink) {
  const w = measure(s, 2) + 16;
  rect(g, W / 2 - w / 2, y - 3, w, 20, bg); rect(g, W / 2 - w / 2, y - 3, w, 1, col); rect(g, W / 2 - w / 2, y + 16, w, 1, col);
  text(g, s, W / 2, y, col, { align: 'center', scale: 2, shadow: P.ink });
}
