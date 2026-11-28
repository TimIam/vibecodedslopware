// Track 16: Turbulence. ASTEROID RUN.
// Pseudo-3D flight, 16-bit sprite-scaling style. Everything lives in "ship-plane" coordinates
// (screen pixels at the ship's depth, z = 1) and is projected toward a vanishing point that
// leans against the ship's position. Rocks and rings ride in from z = 12 in waves that land on
// the 132 BPM beat; gusts shove the ship and have to be steered against.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, ball, sky, mix, bake, dith, rng as mkrng } from '../gfx.js';
import { text, measure } from '../font.js';
import { topBar, bar, Pops, Particles, banner } from '../hud.js';
import { blob } from '../art.js';

const ZFAR = 12, ZSHIP = 1;
const XMIN = 22, XMAX = 234, YMIN = 54, YMAX = 200;
const TRIP = 80;        // seconds of flight at cruise speed
const CRUISE = 7.2;     // z units per second

// Rock sprites: a few shapes baked once at full size, drawn scaled.
function rockArt(i) {
  return bake('turb-rock' + i, 56, 56, g => {
    const r = mkrng(91 + i * 17);
    const parts = [{ x: 28, y: 28, rx: 22, ry: 19, h: 18 }];
    for (let k = 0; k < 4; k++) parts.push({ x: 28 + (r() - 0.5) * 22, y: 28 + (r() - 0.5) * 20, rx: 8 + r() * 8, ry: 7 + r() * 7, h: 6 + r() * 5, z: 8 });
    const ramp = i % 2 ? [P.ink, P.brown0, P.brown1, P.brown2, P.tan] : [P.ink, P.s0, P.s1, P.s2, P.s3];
    blob(g, parts, ramp, { rim: i % 2 ? P.orange : P.ice });
    for (let k = 0; k < 5; k++) { const x = 14 + r() * 28, y = 14 + r() * 26, s = 2 + r() * 3; ellipse(g, x, y, s, s * 0.8, ramp[1]); px(g, x - s * 0.5, y - s * 0.5, ramp[0]); }
  });
}
// Iron rocks: lasers just spark off them.
function ironArt() {
  return bake('turb-iron', 56, 56, g => {
    blob(g, [{ x: 28, y: 28, rx: 22, ry: 20, h: 18 }, { x: 20, y: 22, rx: 10, ry: 9, h: 8, z: 9 }, { x: 36, y: 34, rx: 10, ry: 8, h: 7, z: 9 }], [P.ink, '#1c1628', '#2e2640', '#4a3f63', '#7c6f9a'], { rim: P.red });
    for (let i = 0; i < 7; i++) { const a = i * 0.9; rect(g, 28 + Math.cos(a) * 14, 28 + Math.sin(a) * 12, 2, 2, P.red); }
  });
}
// The ship seen from behind.
function shipArt(boost) {
  return bake('turb-ship' + boost, 64, 38, g => {
    poly(g, [[32, 10], [62, 28], [60, 32], [44, 28], [32, 24], [20, 28], [4, 32], [2, 28]], P.s1);
    poly(g, [[32, 11], [60, 28], [44, 26], [32, 21]], P.s2);
    poly(g, [[32, 11], [4, 28], [20, 26], [32, 21]], P.s3);
    poly(g, [[30, 4], [34, 4], [36, 18], [28, 18]], P.s2);
    blob(g, [{ x: 32, y: 21, rx: 12, ry: 11, h: 10 }, { x: 32, y: 14, rx: 6, ry: 5, h: 5, z: 8 }], RAMP.steel, { rim: P.orange });
    rect(g, 28, 11, 9, 4, P.cyan); rect(g, 29, 11, 3, 1, P.ice);
    for (const x of [21, 43]) { ellipse(g, x, 27, 5, 4, P.s0); ellipse(g, x, 27, 3.5, 2.5, boost ? P.white : P.amber); px(g, x - 1, 26, P.cream); }
    rect(g, 1, 28, 4, 4, P.red); rect(g, 59, 28, 4, 4, P.red); px(g, 2, 28, P.pink); px(g, 60, 28, P.pink);
  });
}
function nebula() {
  return bake('turb-neb', 320, 140, g => {
    for (const [cx, cy, rx, ry, c, d] of [[110, 70, 120, 34, P.deep, 0.5], [190, 60, 90, 26, P.navy, 0.4], [150, 80, 70, 20, '#3a1f4f', 0.35], [80, 60, 60, 18, '#2c1840', 0.5]]) {
      g.fillStyle = c;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q < 1 && dith(x, y, d * (1 - q))) g.fillRect(x, y, 1, 1);
      }
    }
  });
}
function cellArt() {
  return bake('turb-cell', 16, 16, g => { ball(g, 8, 8, 6, 6, RAMP.sea, { rim: P.white }); rect(g, 7, 4, 2, 8, P.white); rect(g, 4, 7, 8, 2, P.white); });
}

export default {
  id: 'turbulence', track: 16, song: 'turbulence', name: 'Turbulence', title: 'ASTEROID RUN',
  blurb: 'Fly the stolen ship through the asteroid belt to the Federation arena. Thread the rings, blast the rocks, steer against the gusts.',
  how: ['◀▲▼▶ STEER', 'Ⓐ FIRE (HOLD)', 'RINGS = BOOST', 'FIGHT THE GUSTS'],
  par: [0, 4500, 7000, 9200],
  make(ctx) {
    const { I, sfx } = ctx;
    const r = ctx.rng;
    const pops = Pops(), parts = Particles();
    const inst = { result: null };
    let t = 0, dist = 0, shield = 5, inv = 0, score = 0, ringsHit = 0, ringsAll = 0, rocks = 0, hits = 0, streak = 0;
    let sx = 128, sy = 160, vx = 0, vy = 0, bank = 0, fireT = 0, boost = 0;
    let lastBeat = -1, gust = null, nextGust = 9 + r() * 3, warnT = 0, dead = 0, arrive = 0, flashSide = 0;
    const objs = [], shots = [];
    const stars = Array.from({ length: 80 }, () => ({ a: r() * 6.283, d: r(), s: 0.4 + r() * 0.8 }));

    const vp = () => [128 - (sx - 128) * 0.28, 96 - (sy - 130) * 0.22];
    const proj = (ox, oy, z) => { const [vx0, vy0] = vp(); return [vx0 + (ox - vx0) / z, vy0 + (oy - vy0) / z, 1 / z]; };

    function spawn(kind, ox, oy) {
      const o = { kind, ox, oy, z: ZFAR, hp: 1, R: 12, spin: r() * 6.28, art: (r() * 4) | 0, done: false };
      if (kind === 'rock') { o.R = 11 + r() * 12; o.hp = o.R > 18 ? 2 : 1; }
      if (kind === 'iron') { o.R = 14 + r() * 8; o.hp = 1e9; }
      if (kind === 'debris') { o.R = 6; }
      if (kind === 'ring') { o.R = 30; ringsAll++; }
      if (kind === 'cell') { o.R = 9; }
      objs.push(o);
      return o;
    }
    const clampX = x => Math.max(XMIN + 10, Math.min(XMAX - 10, x));
    const clampY = y => Math.max(YMIN + 10, Math.min(YMAX - 10, y));

    // One wave per beat; the pattern hardens as the trip goes on.
    function onBeat(b) {
      const prog = dist / TRIP;
      const bar4 = b % 16;
      if (prog > 0.93) return;
      if (b % 8 === 4) { spawn('ring', clampX(sx + (r() - 0.5) * 140), clampY(sy + (r() - 0.5) * 90)); return; }
      const nRock = prog < 0.25 ? (b % 2 ? 1 : 0) : prog < 0.6 ? 1 : 1 + (r() < 0.45 ? 1 : 0);
      for (let i = 0; i < nRock; i++) {
        // Half the rocks aim at you, half are scenery that still has to be avoided.
        const aim = r() < 0.45;
        const x = aim ? sx + (r() - 0.5) * 50 : XMIN + r() * (XMAX - XMIN);
        const y = aim ? sy + (r() - 0.5) * 40 : YMIN + r() * (YMAX - YMIN);
        spawn(prog > 0.2 && r() < 0.18 + prog * 0.14 ? 'iron' : 'rock', clampX(x), clampY(y));
      }
      if (prog > 0.35 && bar4 === 10) for (let i = 0; i < 4; i++) spawn('debris', clampX(sx + (i - 1.5) * 26), clampY(sy - 20 + r() * 40));
      if (bar4 === 14 && r() < 0.35) spawn('cell', clampX(XMIN + r() * 200), clampY(YMIN + r() * 130));
      for (let i = 0; i < 2; i++) {
        const side = r() < 0.5 ? -1 : 1, o = spawn('rock', 128 + side * (150 + r() * 120), 40 + r() * 200);
        o.scenery = true; o.R = 16 + r() * 18;
      }
    }

    function hurt(o) {
      if (inv > 0) return;
      shield--; hits++; inv = 1.1; streak = 0;
      sfx('hurt'); sfx('boom', 0.6); ctx.shake(6); ctx.flash(0.35);
      parts.burst(sx, sy, 18, [P.orange, P.amber, P.red, P.s3], 90, 0.7, 40);
      pops.add('SHIELD -1', sx, sy - 24, P.red);
      if (shield <= 0) { dead = 0.01; sfx('boom'); parts.burst(sx, sy, 50, [P.white, P.amber, P.orange, P.red], 140, 1.2, 20); }
      void o;
    }

    inst.update = dt => {
      t += dt;
      pops.update(dt); parts.update(dt);
      if (inst.result) return;
      if (dead > 0) {
        dead += dt;
        if (dead > 1.4) inst.result = { win: false, score, lines: [`DISTANCE ${Math.floor(dist / TRIP * 100)}%`, `RINGS ${ringsHit}`, `ROCKS SMASHED ${rocks}`, 'SHIELD DOWN'] };
        return;
      }
      if (arrive > 0) {
        arrive += dt;
        sx += (128 - sx) * dt * 2; sy += (120 - sy) * dt * 2;
        if (arrive > 2.2) {
          const sBonus = shield * 300;
          score += sBonus;
          inst.result = { win: true, score, lines: [`RINGS ${ringsHit}/${ringsAll}`, `ROCKS SMASHED ${rocks}`, `HITS TAKEN ${hits}`, `SHIELD ${shield}/5  +${sBonus}`] };
        }
        return;
      }
      const speed = CRUISE * (1 + boost * 0.6);
      dist += dt * (speed / CRUISE);
      if (boost > 0) boost = Math.max(0, boost - dt * 0.5);
      if (inv > 0) inv -= dt;
      if (dist >= TRIP) { arrive = 0.01; sfx('whoosh'); sfx('power'); return; }

      // Steering: thrusters with drag, plus the gust.
      const [ax, ay] = I.axis();
      vx += ax * 520 * dt; vy += ay * 440 * dt;
      vx *= Math.pow(0.02, dt); vy *= Math.pow(0.02, dt);
      if (gust && gust.t > 0) { vx += gust.dx * 330 * dt; vy += gust.dy * 300 * dt; }
      sx += vx * dt; sy += vy * dt;
      if (sx < XMIN) { sx = XMIN; vx = 0; } if (sx > XMAX) { sx = XMAX; vx = 0; }
      if (sy < YMIN) { sy = YMIN; vy = 0; } if (sy > YMAX) { sy = YMAX; vy = 0; }
      bank += ((-vx / 160) - bank) * Math.min(1, dt * 8);

      // Gusts: warn, then shove.
      nextGust -= dt;
      if (!gust && nextGust <= 0 && dist / TRIP < 0.92) {
        const dirs = [[1, 0], [-1, 0], [0, -1], [1, -0.6], [-1, -0.6]];
        const [dx, dy] = dirs[(r() * dirs.length) | 0];
        const k = 0.8 + dist / TRIP * 0.6;
        gust = { dx: dx * k, dy: dy * k, warn: 1.1, t: 0, len: 1.6 + dist / TRIP };
        sfx('alarm');
      }
      if (gust) {
        if (gust.warn > 0) { gust.warn -= dt; if (gust.warn <= 0) { gust.t = gust.len; sfx('whoosh'); } }
        else { gust.t -= dt; ctx.shake(2); if (gust.t <= 0) { gust = null; nextGust = 6 + r() * 4 - dist / TRIP * 2; } }
      }

      // Fire.
      fireT -= dt;
      if (I.down('a') && fireT <= 0) {
        fireT = 0.16;
        for (const s of [-12, 12]) shots.push({ ox: sx + s, oy: sy - 4, z: ZSHIP });
        sfx('shoot');
      }
      for (const s of shots) s.z += dt * 22;
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].z > ZFAR || shots[i].hit) shots.splice(i, 1);

      // Waves on the beat.
      const b = Math.floor(ctx.beat());
      if (b !== lastBeat) { if (b > lastBeat && b >= 4) for (let k = Math.max(lastBeat + 1, 4); k <= b; k++) onBeat(k); lastBeat = b; }

      // Move objects; check shots and the ship plane.
      for (const o of objs) {
        const z0 = o.z;
        o.z -= dt * speed;
        o.spin += dt;
        if ((o.kind === 'rock' || o.kind === 'debris' || o.kind === 'iron') && o.z > ZSHIP && !o.scenery) {
          for (const s of shots) {
            if (s.hit || Math.abs(s.z - o.z) > 0.7) continue;
            if (Math.hypot(s.ox - o.ox, s.oy - o.oy) < o.R + 5) {
              s.hit = true; o.hp--;
              const [px0, py0, k] = proj(o.ox, o.oy, o.z);
              if (o.kind === 'iron') { parts.burst(px0, py0, 3, [P.white, P.amber], 30, 0.2, 0); if ((t * 10 | 0) % 3 === 0) sfx('tick'); continue; }
              if (o.hp <= 0) {
                o.done = true; rocks++; score += o.kind === 'rock' ? 50 : 20;
                sfx('boom', 0.5); parts.burst(px0, py0, 12, o.art % 2 ? [P.brown2, P.tan, P.orange] : [P.s2, P.s3, P.orange], 60 * k + 20, 0.5, 30);
                pops.add(o.kind === 'rock' ? '+50' : '+20', px0, py0 - 6, P.cream);
              } else { sfx('brick'); parts.burst(px0, py0, 4, [P.amber, P.white], 40, 0.3, 0); }
            }
          }
        }
        if (o.done) continue;
        if (z0 > ZSHIP && o.z <= ZSHIP && !o.scenery) {
          const d = Math.hypot(o.ox - sx, o.oy - sy);
          if (o.kind === 'ring') {
            if (d < o.R - 6) {
              ringsHit++; streak++; const pts = 150 + Math.min(5, streak - 1) * 50; score += pts; boost = 1;
              sfx('coin'); sfx('power'); ctx.flash(0.2);
              pops.add('RING +' + pts, sx, sy - 26, P.cyan);
              parts.burst(sx, sy, 16, [P.cyan, P.ice, P.white], 80, 0.6, 0);
              o.done = true;
            } else streak = 0;
          } else if (o.kind === 'cell') {
            if (d < o.R + 16) { o.done = true; shield = Math.min(5, shield + 1); score += 100; sfx('heart'); pops.add('SHIELD +1', sx, sy - 26, P.ice); }
          } else if (d < o.R + 9) { hurt(o); o.done = true; parts.burst(sx, sy - 4, 10, [P.s3, P.brown2], 70, 0.5, 40); }
        }
      }
      for (let i = objs.length - 1; i >= 0; i--) if (objs[i].done || objs[i].z < 0.35) objs.splice(i, 1);
    };

    // Bot: fly to the next ring, dodge what's coming, counter the gust, hold fire.
    inst.auto = () => {
      const keys = ['a'];
      let tx = 128, ty = 150;
      const ringO = objs.filter(o => o.kind === 'ring' && !o.done && o.z > ZSHIP).sort((a, b) => a.z - b.z)[0];
      if (ringO && ringO.z < 7) { tx = ringO.ox; ty = ringO.oy; }
      const cell = objs.find(o => o.kind === 'cell' && o.z < 5 && o.z > ZSHIP);
      if (cell && !ringO) { tx = cell.ox; ty = cell.oy; }
      // Pick the safest spot near the goal: rocks arriving soon weigh most.
      const threats = objs.filter(o => !o.done && (o.kind === 'iron' || ((o.kind === 'rock' || o.kind === 'debris') && o.z < 2.6)) && o.z > ZSHIP && o.z < 6);
      if (threats.length) {
        let best = null, bs = -1e9;
        for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) {
          const cx = clampX(sx + i * 18), cy = clampY(sy + j * 16);
          let sc = -Math.hypot(cx - tx, cy - ty) * 0.25 - Math.hypot(cx - sx, cy - sy) * 0.15;
          for (const o of threats) { const d = Math.hypot(cx - o.ox, cy - o.oy), need = o.R + 24; if (d < need) sc -= (need - d) * 40 / o.z; }
          if (sc > bs) { bs = sc; best = [cx, cy]; }
        }
        [tx, ty] = best;
      }
      // Lead the gust.
      if (gust && gust.warn <= 0) { tx -= gust.dx * 40; ty -= gust.dy * 40; }
      const ex = tx - (sx + vx * 0.12), ey = ty - (sy + vy * 0.12);
      if (ex > 4) keys.push('right'); else if (ex < -4) keys.push('left');
      if (ey > 4) keys.push('down'); else if (ey < -4) keys.push('up');
      if ((window.__d3 && window.__d3.botBlind)) return [];
      return keys;
    };

    function drawObj(g, o) {
      const [x, y, k] = proj(o.ox, o.oy, o.z);
      const fade = o.z > ZFAR - 2 ? (ZFAR - o.z) / 2 : 1;
      g.globalAlpha = Math.max(0, Math.min(1, fade));
      if (o.kind === 'rock' || o.kind === 'debris' || o.kind === 'iron') {
        const a = o.kind === 'iron' ? ironArt() : rockArt(o.art), s = (o.R * 2 + 4) * k;
        if (s >= 1) g.drawImage(a, Math.round(x - s / 2), Math.round(y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
        if (o.hp > 1 && s > 8) { g.globalAlpha *= 0.5; ring(g, x, y, s / 2 + 1, P.amber); }
      } else if (o.kind === 'ring') {
        const R = o.R * k, pulse = Math.max(0, 1 - (ctx.beat() % 1) * 3);
        const th = Math.max(1, Math.round(4 * k));
        ring(g, x, y, R + th, P.navy, th + 1);
        ring(g, x, y, R, pulse > 0.3 ? P.white : P.cyan, th);
        if (R > 6) for (let i = 0; i < 8; i++) { const a = i * 0.785 + o.spin; rect(g, x + Math.cos(a) * R - 1, y + Math.sin(a) * R - 1, Math.max(2, th), Math.max(2, th), P.amber); }
      } else if (o.kind === 'cell') {
        const s = 16 * k * 1.4;
        if (s >= 2) g.drawImage(cellArt(), Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
      }
      g.globalAlpha = 1;
    }

    inst.draw = g => {
      const [vpx, vpy] = vp();
      const prog = Math.min(1, dist / TRIP);
      sky(g, 0, H, [P.ink, P.ink, P.deep, P.navy, P.deep]);
      // Nebula band.
      g.drawImage(nebula(), Math.round(vpx - 160), Math.round(vpy - 70));
      // Destination: the Federation arena planet grows from the vanishing point.
      const pr = 3 + Math.pow(prog, 5) * 120 + (arrive > 0 ? arrive * arrive * 60 : 0);
      ball(g, vpx, vpy, pr, pr, [P.ink, P.blood, P.red, P.orange, P.amber], { rim: P.cream });
      if (pr > 12) { ring(g, vpx, vpy, pr * 1.5, P.amber); ring(g, vpx, vpy, pr * 1.55, P.gold1); }
      // Streaking stars from the vanishing point; longer on the beat.
      const pulse = Math.max(0, 1 - (ctx.beat() % 1) * 2.5);
      const sp = 1 + boost * 1.5 + pulse * 0.8;
      for (const s of stars) {
        s.d += (0.18 + s.d * 1.6) * (1 / 60) * s.s * sp * (dead ? 0.2 : 1);
        if (s.d > 1.2) { s.d = 0.02; s.a = Math.random() * 6.283; }
        const rr = s.d * s.d * 220, len = 2 + s.d * 14 * sp;
        const gx = gust && gust.warn <= 0 ? gust.dx * 10 * s.d : 0;
        const x0 = vpx + Math.cos(s.a) * rr, y0 = vpy + Math.sin(s.a) * rr * 0.8;
        line(g, x0, y0, x0 + Math.cos(s.a) * len - gx, y0 + Math.sin(s.a) * len * 0.8, s.d > 0.7 ? P.white : s.d > 0.4 ? P.s3 : P.s1);
      }
      // Far to near.
      const sorted = objs.slice().sort((a, b) => b.z - a.z);
      for (const o of sorted) if (o.z >= ZSHIP) drawObj(g, o);
      for (const s of shots) {
        const [x, y, k] = proj(s.ox, s.oy, s.z);
        const L = Math.max(1, 8 * k);
        rect(g, x - Math.max(1, k * 2), y - L, Math.max(1, k * 3), L * 2, P.lime);
      }
      // Ship.
      if (!(dead > 0.15)) {
        const blink = inv > 0 && (t * 16 | 0) % 2;
        if (!blink) {
          const sh = shipArt(boost > 0.2 ? 1 : 0);
          g.save(); g.translate(Math.round(sx), Math.round(sy)); g.rotate(Math.max(-0.5, Math.min(0.5, bank)));
          const flick = (t * 30 | 0) % 2;
          for (const ex of [-9, 9]) { rect(g, ex - 2, 7, 4, 3 + flick * 2 + boost * 6, P.amber); rect(g, ex - 1, 8, 2, 2 + boost * 4, P.white); }
          const s = arrive > 0 ? Math.max(0.1, 1 - arrive * 0.4) : 1;
          g.drawImage(sh, -sh.width * s / 2, -sh.height * s / 2 - 4, sh.width * s, sh.height * s);
          g.restore();
        }
      }
      for (const o of sorted) if (o.z < ZSHIP) drawObj(g, o);
      parts.draw(g); pops.draw(g);
      // Gust warning.
      if (gust && gust.warn > 0 && (t * 6 | 0) % 2) {
        banner(g, 'TURBULENCE!', 70, P.red);
        const ax = gust.dx > 0.1 ? '▶ ▶ ▶' : gust.dx < -0.1 ? '◀ ◀ ◀' : '▲ ▲ ▲';
        text(g, ax, 128, 96, P.amber, { align: 'center', scale: 2, shadow: P.ink });
      }
      if (gust && gust.warn <= 0) {
        const a = gust.dx > 0.1 ? '▶' : gust.dx < -0.1 ? '◀' : '▲';
        for (let i = 0; i < 4; i++) text(g, a, gust.dx > 0.1 ? 240 - i * 8 : gust.dx < -0.1 ? 10 + i * 8 : 30 + i * 60, gust.dx ? 110 + i * 6 : 20 + (t * 60 % 8), P.red);
      }
      if (arrive > 0) { g.globalAlpha = Math.min(1, arrive / 2.2); rect(g, 0, 0, W, H, P.cream); g.globalAlpha = 1; if (arrive > 1) text(g, 'ARENA REACHED', 128, 104, P.blood, { align: 'center', scale: 2 }); }
      // HUD.
      topBar(g, 'ASTEROID RUN', score, streak > 1 ? `RING STREAK ${streak}` : '');
      text(g, 'SHIELD', 6, 16, P.s3);
      for (let i = 0; i < 5; i++) { rect(g, 42 + i * 9, 17, 7, 5, i < shield ? (shield <= 1 ? P.red : P.cyan) : P.s0); if (i < shield) rect(g, 42 + i * 9, 17, 7, 1, P.ice); }
      text(g, 'ARENA', 102, 16, P.s3);
      bar(g, 134, 17, 116, prog, P.amber);
      rect(g, 134 + Math.round(116 * prog) - 1, 15, 2, 8, P.white);
    };
    return inst;
  },
};
