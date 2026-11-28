// Track 19: Love Story. WALLS BETWEEN US.
// Breakout with a heart for a ball. The wall is heart-shaped and Nova waits in its notch.
// Deltron rides a hover board along the rooftops at the bottom. Steel bricks take two hits;
// some bricks drop a rose (wide board), a record (extra heart), a clock (slow motion) or,
// rarely, a spare life.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, ball, sky, stars, skyline, drawStrip, perisphere, spr, mix, bake, dith } from '../gfx.js';
import { text, measure } from '../font.js';
import { topBar, hearts, Pops, Particles, banner } from '../hud.js';
import { DELTRON, HEART, VINYL, blob } from '../art.js';

const L = 8, R = 248, T = 16, PY = 202;
const BW = 24, BH = 9, GAP = 1, COLS = 9;
const BX = Math.round((W - COLS * (BW + GAP) + GAP) / 2), BY = 34;
const MAP = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
];
const ROWCOL = [P.pink, P.magenta, P.red, '#e85a4a', P.orange, '#f6a142', P.amber, P.cream];

// Nova, small, waiting in the notch.
const NOVA = spr(`
...pppp...
..pPPPPp..
.pPssssPp.
.pPsrrsPp.
.pPssssPp.
.pp.ss.pp.
..rrrrrr..
.rRRRRRRr.
.rRRRRRRr.
..rRRRRr..
..rRRRRr..
...rrrr...
...jj.jj..
...jj.jj..
...kk.kk..
`, { p: P.violet, P: P.purple, s: '#c48a5a', r: P.red, R: '#ff6a5e', j: P.navy, k: P.ink }, { outline: true });

const ROSE = spr(`
.rRr.
rRrRr
.rrr.
..g..
.gg..
..g..
`, { r: P.blood, R: P.red, g: P.green }, { outline: true });
const CLOCKI = spr(`
.www.
wwkww
wwkkw
wwwww
.www.
`, { w: P.cream, k: P.ink }, { outline: true });

function brickArt(col, armored, cracked) {
  return bake(`love-brick:${col}:${armored}:${cracked}`, BW, BH, g => {
    if (armored) {
      for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { g.fillStyle = y === 0 ? P.s4 : y === BH - 1 ? P.s0 : dith(x, y, 0.4) ? P.s2 : P.s3; g.fillRect(x, y, 1, 1); }
      for (const x of [2, BW - 3]) { px(g, x, 2, P.white); px(g, x, BH - 3, P.s1); }
      if (cracked) { line(g, 8, 1, 11, 4, P.ink); line(g, 11, 4, 9, 7, P.ink); line(g, 11, 4, 16, 5, P.ink); }
      return;
    }
    rect(g, 0, 0, BW, BH, col);
    rect(g, 0, 0, BW, 1, mix(col, P.white, 0.45));
    rect(g, 0, BH - 1, BW, 1, mix(col, P.ink, 0.45));
    rect(g, 0, 4, BW, 1, mix(col, P.ink, 0.25));
    rect(g, 11, 0, 1, 4, mix(col, P.ink, 0.3)); rect(g, 5, 5, 1, 3, mix(col, P.ink, 0.3)); rect(g, 18, 5, 1, 3, mix(col, P.ink, 0.3));
    px(g, 2, 1, P.white);
  });
}

function boardArt(w) {
  return bake('love-board' + w, w, 7, g => {
    blob(g, [{ x: w / 2, y: 3.5, rx: w / 2, ry: 3.5, h: 3, ey: 4 }], RAMP.neon, { rim: P.white });
    rect(g, 3, 5, w - 6, 1, P.cyan);
  });
}

export default {
  id: 'love', track: 19, song: 'lovestory', name: 'Love Story', title: 'WALLS BETWEEN US',
  blurb: 'Nova is waiting inside a heart of walls across town. Bounce your heart off the hover board and break every wall between you.',
  how: ['◀ ▶ MOVE', 'Ⓐ LAUNCH', 'BREAK EVERY WALL', '3 HEARTS'],
  par: [0, 4400, 5500, 6200],
  make(ctx) {
    const { I, sfx } = ctx;
    const r = ctx.rng;
    const pops = Pops(), parts = Particles();
    const inst = { result: null };
    const bricks = [];
    MAP.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      const armored = (x + y * 3) % 5 === 0 && y < 6;
      bricks.push({ x: BX + x * (BW + GAP), y: BY + y * (BH + GAP), col: ROWCOL[y], hp: armored ? 2 : 1, armored, alive: true, drop: null });
    }));
    // Power-ups hidden in some bricks.
    const pool = bricks.filter(b => !b.armored);
    const give = (kind, n) => { for (let i = 0; i < n; i++) { const b = pool.splice((r() * pool.length) | 0, 1)[0]; if (b) b.drop = kind; } };
    give('rose', 3); give('record', 4); give('clock', 2); give('life', 1);
    const total = bricks.length;
    const novaBox = { x: 128 - 7, y: BY + 2, w: 14, h: 17 };

    let t = 0, px0 = 128, pvx = 0, wide = 0, slow = 0, lives = 3, score = 0, broken = 0, chain = 0, lost = 0, reunion = 0, deadT = 0;
    let balls = [], drops = [], launchT = 0, botLatch = false, homing = false;
    const bw = () => (wide > 0 ? 48 : 32);
    const resetBall = () => { balls = [{ x: px0, y: PY - 5, vx: 0, vy: 0, held: true, sp: 150 }]; launchT = 0; };
    resetBall();

    function launch(b) {
      b.held = false; const a = (r() - 0.5) * 0.5;
      b.vx = Math.sin(a) * b.sp; b.vy = -Math.cos(a) * b.sp;
      sfx('heart');
    }
    function hitBrick(b, bk) {
      bk.hp--;
      if (bk.hp > 0) { sfx('lock'); parts.burst(bk.x + BW / 2, bk.y + BH / 2, 5, [P.s3, P.white], 40, 0.3, 80); score += 10; return; }
      bk.alive = false; broken++; chain++;
      const pts = (bk.armored ? 100 : 50) + Math.min(10, chain - 1) * 10;
      score += pts;
      sfx('brick');
      parts.burst(bk.x + BW / 2, bk.y + BH / 2, 8, [bk.col, P.pink, P.white], 50, 0.5, 120);
      if (chain > 2) pops.add(`x${chain} +${pts}`, bk.x + BW / 2, bk.y, P.amber);
      if (bk.drop) drops.push({ kind: bk.drop, x: bk.x + BW / 2, y: bk.y + BH / 2, vy: 40 });
      b.sp = Math.min(215, b.sp + 1.8);
    }

    function stepBall(b, dt) {
      const speedK = slow > 0 ? 0.6 : 1;
      const n = 3;
      for (let s = 0; s < n; s++) {
        const k = dt * speedK / n;
        b.x += b.vx * k; b.y += b.vy * k;
        if (b.x < L + 3) { b.x = L + 3; b.vx = Math.abs(b.vx); sfx('move'); }
        if (b.x > R - 3) { b.x = R - 3; b.vx = -Math.abs(b.vx); sfx('move'); }
        if (b.y < T + 3) { b.y = T + 3; b.vy = Math.abs(b.vy); sfx('move'); }
        // Nova bats it back.
        if (b.x > novaBox.x - 3 && b.x < novaBox.x + novaBox.w + 3 && b.y > novaBox.y - 3 && b.y < novaBox.y + novaBox.h + 3) {
          const cx = novaBox.x + novaBox.w / 2, cy = novaBox.y + novaBox.h / 2;
          if (Math.abs(b.x - cx) / novaBox.w > Math.abs(b.y - cy) / novaBox.h) b.vx = Math.sign(b.x - cx) * Math.abs(b.vx) || 30; else b.vy = Math.sign(b.y - cy) * Math.abs(b.vy);
          b.x += b.vx * k * 2; b.y += b.vy * k * 2;
          if ((t * 4 | 0) % 2) { pops.add('♥', cx, novaBox.y - 4, P.pink, 0.6); }
        }
        // Bricks.
        for (const bk of bricks) {
          if (!bk.alive) continue;
          if (b.x + 3 < bk.x || b.x - 3 > bk.x + BW || b.y + 3 < bk.y || b.y - 3 > bk.y + BH) continue;
          const ox = Math.min(b.x + 3 - bk.x, bk.x + BW - (b.x - 3)), oy = Math.min(b.y + 3 - bk.y, bk.y + BH - (b.y - 3));
          if (ox < oy) { b.vx = b.x < bk.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += Math.sign(b.vx) * ox; }
          else { b.vy = b.y < bk.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += Math.sign(b.vy) * oy; }
          hitBrick(b, bk);
          break;
        }
        // Board.
        const half = bw() / 2;
        if (b.vy > 0 && b.y + 3 >= PY && b.y + 3 <= PY + 7 && b.x > px0 - half - 3 && b.x < px0 + half + 3) {
          const off = Math.max(-1, Math.min(1, (b.x - px0) / (half + 2)));
          const a = off * 1.05 + pvx * 0.0007;
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = PY - 3;
          chain = 0; sfx('heart');
          parts.burst(b.x, PY, 4, [P.pink, P.white], 30, 0.3, 0);
        }
        // Love finds a way: with only a few walls left, rising hearts curve toward the nearest one.
        if (homing && b.vy < 0) {
          let best = null, bd = 1e9;
          for (const bk of bricks) if (bk.alive) { const d = Math.hypot(bk.x + BW / 2 - b.x, bk.y + BH / 2 - b.y); if (d < bd) { bd = d; best = bk; } }
          if (best) {
            const want = Math.atan2(best.y + BH / 2 - b.y, best.x + BW / 2 - b.x), cur = Math.atan2(b.vy, b.vx);
            let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const turn = Math.max(-1, Math.min(1, d)) * 2.2 * k, sp0 = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(cur + turn) * sp0; b.vy = Math.sin(cur + turn) * sp0;
          }
        }
        // Never fly flat.
        const sp = Math.hypot(b.vx, b.vy) || 1;
        if (Math.abs(b.vy) < sp * 0.32) { b.vy = Math.sign(b.vy || -1) * sp * 0.32; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }
        const want = b.sp;
        if (Math.abs(sp - want) > 1) { b.vx *= want / sp; b.vy *= want / sp; }
      }
    }

    inst.update = dt => {
      t += dt;
      pops.update(dt); parts.update(dt);
      if (inst.result) return;
      if (reunion > 0) {
        reunion += dt;
        if ((reunion * 10 | 0) % 3 === 0) parts.burst(128 + (Math.random() - 0.5) * 80, 60 + Math.random() * 60, 2, [P.pink, P.white, P.amber], 30, 0.8, -20);
        if (reunion > 3.2) {
          const lifeB = lives * 500, timeB = Math.max(0, Math.floor(140 - t)) * 15;
          score += lifeB + timeB;
          inst.result = { win: true, score, lines: [`WALLS ${broken}/${total}`, `HEARTS LEFT ${lives}  +${lifeB}`, `TIME ${Math.floor(t)}s  +${timeB}`, `HEARTS DROPPED ${lost}`] };
        }
        return;
      }
      if (deadT > 0) { deadT += dt; if (deadT > 1.2) inst.result = { win: false, score, lines: [`WALLS ${broken}/${total}`, 'OUT OF HEARTS'] }; return; }
      if (wide > 0) wide -= dt; if (slow > 0) slow -= dt;
      // Board.
      const [ax] = I.axis();
      const target = ax * 210;
      pvx += (target - pvx) * Math.min(1, dt * 14);
      px0 += pvx * dt;
      const half = bw() / 2;
      if (px0 < L + half) { px0 = L + half; pvx = 0; } if (px0 > R - half) { px0 = R - half; pvx = 0; }
      // Balls.
      for (const b of balls) {
        if (b.held) { b.x = px0; b.y = PY - 4; launchT += dt; if (I.hit('a') || launchT > 3.5) launch(b); continue; }
        stepBall(b, dt);
      }
      for (let i = balls.length - 1; i >= 0; i--) if (balls[i].y > H + 6) balls.splice(i, 1);
      if (!balls.length) {
        lives--; lost++; chain = 0; wide = 0; slow = 0;
        sfx('hurt'); ctx.shake(3);
        if (lives <= 0) { deadT = 0.01; sfx('lose'); return; }
        pops.add('HEART LOST', 128, 150, P.red, 1.2);
        resetBall();
      }
      // Falling power-ups.
      for (const d of drops) {
        d.y += d.vy * dt; d.vy = Math.min(90, d.vy + 40 * dt);
        if (d.y > PY - 4 && d.y < PY + 8 && Math.abs(d.x - px0) < half + 5) {
          d.got = true; score += 100; sfx('power');
          if (d.kind === 'rose') { wide = 12; pops.add('ROSE! WIDE BOARD', px0, PY - 18, P.pink); }
          if (d.kind === 'record') { const src = balls.find(b => !b.held) || balls[0]; balls.push({ x: src.x, y: src.y, vx: -src.vx || 60, vy: -Math.abs(src.vy || 120), held: false, sp: src.sp }); pops.add('EXTRA HEART!', px0, PY - 18, P.amber); }
          if (d.kind === 'clock') { slow = 9; pops.add('SLOW MOTION', px0, PY - 18, P.cyan); }
          if (d.kind === 'life') { lives = Math.min(5, lives + 1); pops.add('+1 HEART', px0, PY - 18, P.red); }
        }
      }
      drops = drops.filter(d => !d.got && d.y < H + 10);
      if (!homing && total - broken <= 8) { homing = true; pops.add('LOVE FINDS A WAY', 128, 140, P.pink, 1.6); sfx('heart'); }
      if (broken >= total) { reunion = 0.01; balls = []; drops = []; sfx('win'); ctx.flash(0.5); }
    };

    // Bot: track where the lowest falling heart will land, aim the board edge to send it at bricks.
    inst.auto = () => {
      const keys = [];
      const held = balls.find(b => b.held);
      if (held) { if (!botLatch) { botLatch = true; return ['a']; } botLatch = false; return []; }
      botLatch = false;
      let goal = 128;
      const falling = balls.filter(b => b.vy > 0).sort((a, b) => b.y - a.y)[0] || balls[0];
      if (falling) {
        let x = falling.x, y = falling.y, vx = falling.vx, vy = falling.vy;
        if (vy > 0) {
          const tt = (PY - 3 - y) / vy; x += vx * tt;
          const span = R - L - 6; let u = (x - L - 3) % (2 * span); if (u < 0) u += 2 * span; x = L + 3 + (u > span ? 2 * span - u : u);
        }
        // Aim: hit with the side that sends the heart toward the lowest live bricks' centre.
        const live = bricks.filter(b => b.alive);
        const cx = live.length ? live.reduce((s, b) => s + b.x + BW / 2, 0) / live.length : 128;
        const off = Math.max(-0.7, Math.min(0.7, (cx - x) / 160));
        goal = x - off * bw() / 2;
      }
      const drop = drops.filter(d => d.y > 120).sort((a, b) => b.y - a.y)[0];
      if (drop && falling && falling.y < 120) goal = drop.x;
      if (goal < px0 - 3) keys.push('left'); else if (goal > px0 + 3) keys.push('right');
      return keys;
    };

    inst.draw = g => {
      // Dawn over the city.
      sky(g, 0, H, [P.navy, P.indigo, P.violet, P.magenta, P.pink, P.orange, P.amber]);
      stars(g, t, { n: 24, seed: 19, y0: 14, y1: 70, cols: [P.violet, P.s3, P.white] });
      for (let y = -26; y < 26; y++) { if (y > 2 && (y % 5) < (y - 2) / 5) continue; const hw = Math.sqrt(26 * 26 - y * y); rect(g, 196 - hw, 168 + y, hw * 2, 1, y < 0 ? P.amber : P.orange); }
      g.drawImage(perisphere(14, [P.deep, P.navy, P.indigo, P.violet, P.purple], P.pink), 14, 130);
      drawStrip(g, skyline(61, 60, '#2a1840', P.amber), 40, 136);
      drawStrip(g, skyline(62, 34, '#1a1028', P.pink, { spires: false }), 10, 176);
      rect(g, 0, 210, W, 14, P.ink); rect(g, 0, 210, W, 1, P.s0);
      // Walls.
      for (const bk of bricks) if (bk.alive) {
        g.drawImage(brickArt(bk.col, bk.armored, bk.armored && bk.hp === 1), bk.x, bk.y);
        if (bk.drop && (t * 3 | 0) % 4 === 0) px(g, bk.x + BW / 2, bk.y + 4, P.white);
      }
      // Nova.
      const ny = novaBox.y + (reunion > 0 ? 0 : Math.round(Math.sin(t * 2) * 1));
      rect(g, novaBox.x - 3, novaBox.y + 17, 20, 2, P.pink); rect(g, novaBox.x - 3, novaBox.y + 19, 20, 1, P.magenta);
      g.drawImage(NOVA, novaBox.x - 1, ny - 1);
      if ((t * 1.5 | 0) % 2 && reunion <= 0) text(g, '♥', novaBox.x + 16, ny - 2, P.pink);
      // Drops.
      for (const d of drops) {
        const s = d.kind === 'rose' ? ROSE : d.kind === 'record' ? VINYL : d.kind === 'clock' ? CLOCKI : HEART;
        g.drawImage(s, Math.round(d.x - s.width / 2), Math.round(d.y - s.height / 2));
        if (d.kind === 'life') text(g, '1UP', d.x + 6, d.y - 3, (t * 8 | 0) % 2 ? P.white : P.amber, { shadow: P.ink });
      }
      // Hover board and Deltron.
      const w = bw();
      let by = PY, dx = px0;
      if (reunion > 0) { const k = Math.min(1, reunion / 1.6); by = PY + (novaBox.y + 22 - PY) * k * k; dx = px0 + (128 - 14 - px0) * k; }
      const fr = reunion > 0 ? DELTRON[3] : Math.abs(pvx) > 40 ? DELTRON[1 + ((t * 8) | 0) % 2] : DELTRON[0];
      g.drawImage(fr, Math.round(dx - fr.width / 2), Math.round(by - fr.height + 1));
      g.drawImage(boardArt(w), Math.round(dx - w / 2), by);
      const fl = (t * 20 | 0) % 2;
      rect(g, dx - w / 2 + 4, by + 7, w - 8, 1 + fl, P.cyan);
      // Hearts in play.
      for (const b of balls) {
        g.drawImage(HEART, Math.round(b.x - HEART.width / 2), Math.round(b.y - HEART.height / 2));
        if (slow > 0) px(g, b.x - b.vx * 0.03, b.y - b.vy * 0.03, P.cyan);
        if (homing) { px(g, b.x - b.vx * 0.025, b.y - b.vy * 0.025, P.pink); px(g, b.x - b.vx * 0.05, b.y - b.vy * 0.05, P.magenta); }
      }
      parts.draw(g); pops.draw(g);
      if (reunion > 1.6) banner(g, 'TOGETHER AGAIN', 120, P.pink);
      if (balls.some(b => b.held) && (t * 2 | 0) % 2) text(g, 'Ⓐ LAUNCH', 128, 186, P.white, { align: 'center', shadow: P.ink });
      // HUD.
      topBar(g, 'WALLS BETWEEN US', score, `WALLS ${total - broken}`);
      hearts(g, lives, Math.max(3, lives), 4, 214);
      const icons = [];
      if (wide > 0) icons.push([ROSE, wide]); if (slow > 0) icons.push([CLOCKI, slow]);
      icons.forEach(([s, v], i) => { g.drawImage(s, 200 + i * 22, 214); text(g, String(Math.ceil(v)), 208 + i * 22, 214, P.cream); });
    };
    return inst;
  },
};
