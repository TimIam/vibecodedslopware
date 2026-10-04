/* bag.js — a plastic bag you can believe in.
 *
 * The bag is its own silhouette: a closed loop of 32 verlet points held together by
 * stiff edges, soft bending, and a breathing area constraint (the air trapped inside —
 * it puffs up when the wind catches it and goes limp when it lands). Every edge feels
 * the wind along its normal, which is what makes it flutter, tumble and hang.
 *
 * Shared by Desktop Bag (desktop-bag/app) and Pretentious Bag Tycoon (bag-tycoon.html).
 *   Bag.make(x, y, scale)          -> bag
 *   Bag.step(bag, dt, wind, box)   wind(x, y, out) writes px/s into out.x/out.y;
 *                                  box = {left, right, top, bottom}
 *   Bag.draw(ctx, bag, style)      style = {fill, edge, print, alpha}
 *   Bag.noise3(x, y, z)            smooth value noise in [-1, 1]
 */
(function (root) {
  'use strict';

  const N = 32, SPACING = 8;                 // 32 points around a 56×72 rectangle
  const HANDLES = [[0, 2], [5, 7]];          // handles sprout from the mouth corners
  const CREASES = [[2, 21], [5, 18], [3, 25]];
  const G = 90;                              // px/s² — a bag barely falls
  const KN = 3.6, KT = 0.35;                 // air coupling across / along an edge (1/s)
  const ITER = 6;

  function make(x, y, scale) {
    scale = scale || 1;
    const s = SPACING * scale, W = 7 * s, H = 9 * s;
    const b = {
      n: N, scale, rest: s,
      px: new Float32Array(N), py: new Float32Array(N),
      ox: new Float32Array(N), oy: new Float32Array(N),
      ax: new Float32Array(N), ay: new Float32Array(N),
      bend: new Float32Array(N),
      area0: 0, inflate: 0.7, relAvg: 0,
      cx: x, cy: y, vx: 0, vy: 0,
      angle: 0, spin: 0, angVel: 0,
      touch: 0,        // seconds since any point last touched the box
      gap: 1e9,        // distance from the lowest point to the floor
      seed: Math.random() * 1000,
    };
    for (let i = 0; i < N; i++) {
      const d = i * s;
      let u, v;
      if (d <= W) { u = d; v = 0; }
      else if (d <= W + H) { u = W; v = d - W; }
      else if (d <= 2 * W + H) { u = W - (d - W - H); v = H; }
      else { u = 0; v = H - (d - 2 * W - H); }
      b.px[i] = b.ox[i] = x - W / 2 + u;
      b.py[i] = b.oy[i] = y - H / 2 + v;
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 2) % N;
      b.bend[i] = Math.hypot(b.px[j] - b.px[i], b.py[j] - b.py[i]);
    }
    b.area0 = area(b);
    derive(b, 1 / 60);
    return b;
  }

  function area(b) {
    const { px, py, n } = b;
    let a = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) a += px[j] * py[i] - px[i] * py[j];
    return a * 0.5;
  }

  const W_ = { x: 0, y: 0 };

  function step(b, dt, wind, box) {
    const { px, py, ox, oy, ax, ay, n } = b;
    const inv = 1 / dt;

    // ---- forces: gravity + per-edge aerodynamics
    for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = G; }
    let relSum = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ex = px[j] - px[i], ey = py[j] - py[i];
      const len = Math.hypot(ex, ey) || 1e-6;
      const tx = ex / len, ty = ey / len, nx = ty, ny = -tx;
      const vx = ((px[i] - ox[i]) + (px[j] - ox[j])) * 0.5 * inv;
      const vy = ((py[i] - oy[i]) + (py[j] - oy[j])) * 0.5 * inv;
      wind((px[i] + px[j]) * 0.5, (py[i] + py[j]) * 0.5, W_);
      const rx = W_.x - vx, ry = W_.y - vy;
      relSum += Math.hypot(rx, ry);
      const rn = rx * nx + ry * ny, rt = rx * tx + ry * ty;
      const k = 0.5 * len / b.rest;
      const fx = (nx * rn * KN + tx * rt * KT) * k, fy = (ny * rn * KN + ty * rt * KT) * k;
      ax[i] += fx; ay[i] += fy; ax[j] += fx; ay[j] += fy;
    }
    b.relAvg = relSum / n;

    // ---- integrate
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      const vx = (px[i] - ox[i]) * 0.999, vy = (py[i] - oy[i]) * 0.999;
      ox[i] = px[i]; oy[i] = py[i];
      px[i] += vx + ax[i] * dt2;
      py[i] += vy + ay[i] * dt2;
    }

    // ---- the breath: catches air in a breeze, sags when resting
    const grounded = b.touch < 0.15;
    const want = grounded ? 0.52 : 0.62 + 0.34 * Math.min(1, b.relAvg / 140);
    b.inflate += (want - b.inflate) * Math.min(1, dt * 1.3);

    // ---- constraints
    const target = b.area0 * b.inflate;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {                       // edges (inextensible film)
        const j = i + 1 === n ? 0 : i + 1;
        const dx = px[j] - px[i], dy = py[j] - py[i];
        const d = Math.hypot(dx, dy) || 1e-6;
        const c = (d - b.rest) / d * 0.5;
        px[i] += dx * c; py[i] += dy * c; px[j] -= dx * c; py[j] -= dy * c;
      }
      for (let i = 0; i < n; i++) {                       // bending (soft — it's plastic)
        const j = (i + 2) % n;
        const dx = px[j] - px[i], dy = py[j] - py[i];
        const d = Math.hypot(dx, dy) || 1e-6;
        const c = (d - b.bend[i]) / d * 0.5 * 0.06;
        px[i] += dx * c; py[i] += dy * c; px[j] -= dx * c; py[j] -= dy * c;
      }
      // area (PBD): C = A - target, ∇A_i = ½(y[i+1]-y[i-1], x[i-1]-x[i+1])
      const C = area(b) - target;
      let g2 = 0;
      for (let i = 0; i < n; i++) {
        const a = i === 0 ? n - 1 : i - 1, c = i + 1 === n ? 0 : i + 1;
        const gx = 0.5 * (py[c] - py[a]), gy = 0.5 * (px[a] - px[c]);
        g2 += gx * gx + gy * gy;
      }
      if (g2 > 1e-9) {
        const lam = -C / g2 * 0.25;
        const sx = Float32Array.from(px), sy = Float32Array.from(py);
        for (let i = 0; i < n; i++) {
          const a = i === 0 ? n - 1 : i - 1, c = i + 1 === n ? 0 : i + 1;
          px[i] += lam * 0.5 * (sy[c] - sy[a]);
          py[i] += lam * 0.5 * (sx[a] - sx[c]);
        }
      }
    }

    // ---- the room
    let contact = false, low = -1e9;
    for (let i = 0; i < n; i++) {
      if (py[i] > box.bottom) {
        py[i] = box.bottom; oy[i] = py[i];
        ox[i] = px[i] - (px[i] - ox[i]) * 0.7;          // friction on the ground
        contact = true;
      } else if (py[i] < box.top) { py[i] = box.top; oy[i] = py[i]; contact = true; }
      if (px[i] < box.left) { px[i] = box.left; ox[i] = px[i]; contact = true; }
      else if (px[i] > box.right) { px[i] = box.right; ox[i] = px[i]; contact = true; }
      if (py[i] > low) low = py[i];
    }
    b.touch = contact ? 0 : b.touch + dt;
    b.gap = box.bottom - low;
    derive(b, dt);
  }

  function derive(b, dt) {
    const { px, py, ox, oy, n } = b;
    let cx = 0, cy = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; vx += px[i] - ox[i]; vy += py[i] - oy[i]; }
    b.cx = cx / n; b.cy = cy / n; b.vx = vx / n / dt; b.vy = vy / n / dt;
    // "up" = from the middle of the bottom to the middle of the mouth
    const ux = (px[3] + px[4]) * 0.5 - (px[19] + px[20]) * 0.5;
    const uy = (py[3] + py[4]) * 0.5 - (py[19] + py[20]) * 0.5;
    const ang = Math.atan2(ux, -uy);
    let d = ang - b.angle;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    b.spin += d; b.angVel = d / dt; b.angle = ang;
  }

  // ---- drawing ------------------------------------------------------------
  function trace(ctx, b) {
    const { px, py, n } = b;
    ctx.beginPath();
    ctx.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      ctx.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
    }
    ctx.closePath();
  }

  function draw(ctx, b, style) {
    style = style || {};
    const { px, py } = b, s = b.scale;
    const fill = style.fill || 'rgba(250,250,252,0.62)';
    const edge = style.edge || 'rgba(255,255,255,0.9)';
    ctx.save();
    ctx.globalAlpha = style.alpha == null ? 1 : style.alpha;
    ctx.lineJoin = ctx.lineCap = 'round';

    // handles — loops standing up off the mouth, trailing a little behind the motion
    const tx = px[7] - px[0], ty = py[7] - py[0], tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl;
    for (const [a, c] of HANDLES) {
      const mx = (px[a] + px[c]) / 2, my = (py[a] + py[c]) / 2;
      const h = 17 * s;
      const kx = mx + nx * h * 2 - b.vx * 0.05, ky = my + ny * h * 2 - b.vy * 0.05;
      ctx.beginPath(); ctx.moveTo(px[a], py[a]); ctx.quadraticCurveTo(kx, ky, px[c], py[c]);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 6.5 * s; ctx.stroke();
      ctx.strokeStyle = fill; ctx.lineWidth = 5 * s; ctx.stroke();
    }

    // body
    trace(ctx, b);
    ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 10 * s; ctx.shadowOffsetY = 3 * s;
    ctx.fillStyle = fill; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1.6 * s; ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 0.8 * s; ctx.stroke();

    ctx.save();
    trace(ctx, b); ctx.clip();
    // sheen: plastic catches the light along one side
    const sh = ctx.createLinearGradient(b.cx - 30 * s, b.cy - 30 * s, b.cx + 30 * s, b.cy + 30 * s);
    sh.addColorStop(0, 'rgba(255,255,255,0.38)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = sh; ctx.fillRect(b.cx - 90 * s, b.cy - 90 * s, 180 * s, 180 * s);
    // creases: soft folds hanging down from the mouth; they sway as it breathes
    for (const [a, c] of CREASES) {
      const ex = px[a] + (px[c] - px[a]) * 0.62, ey = py[a] + (py[c] - py[a]) * 0.62;
      const qx = (px[a] + ex) / 2 + (b.cx - px[a]) * 0.35 + Math.sin(b.seed + a) * 4 * s;
      const qy = (py[a] + ey) / 2 + (b.cy - py[a]) * 0.15;
      ctx.beginPath(); ctx.moveTo(px[a], py[a]); ctx.quadraticCurveTo(qx, qy, ex, ey);
      ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 2.2 * s; ctx.stroke();
      ctx.translate(1.2, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9 * s; ctx.stroke();
      ctx.translate(-1.2, 0);
    }
    // the print
    if (style.print !== false) {
      ctx.translate(b.cx, b.cy + 4 * s);
      ctx.rotate(b.angle);
      ctx.scale(0.4 + b.inflate * 0.45, 1);
      ctx.fillStyle = style.printColor || 'rgba(196,38,38,0.42)';
      ctx.textAlign = 'center';
      ctx.font = `700 ${7 * s}px Arial, sans-serif`;
      ctx.fillText('THANK YOU', 0, -5 * s);
      ctx.fillText('THANK YOU', 0, 4 * s);
      ctx.font = `${9 * s}px Arial, sans-serif`;
      ctx.fillText('☺', 0, 15 * s);
    }
    ctx.restore();
    ctx.restore();
  }

  // ---- noise --------------------------------------------------------------
  function hash3(i, j, k) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const fade = (t) => t * t * (3 - 2 * t);
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    const r = l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
      w);
    return r * 2 - 1;
  }

  root.Bag = { make, step, draw, trace, noise3, area };
})(typeof window !== 'undefined' ? window : globalThis);
