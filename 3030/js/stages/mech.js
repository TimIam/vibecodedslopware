// Track 02, "3030": MECH BREAKOUT. A side-scrolling run-and-gun in a hijacked security mech:
// stomp across the city under a planet-wide manhunt, beat the Warden mech, reach the lab.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, sky, stars, skyline, drawStrip, perisphere, spr, outline, flat, mix, rng } from '../gfx.js';
import { text } from '../font.js';
import { blob } from '../art.js';
import { topBar, Particles, Pops, banner } from '../hud.js';

const GROUND = 190, LEVEL = 3500, BOSS_X = 3300, LAB_X = 3700;
const MAXHP = 6;

// ----------------------------------------------------------------- sprites (baked once)
let ART = null;
function art() {
  if (ART) return ART;
  const A = {};
  // Mech body: a lit hull with a glass cockpit and Deltron inside.
  {
    const [c, g] = canvas(42, 32);
    // Boxy armoured hull (superellipse), a back pack, a shoulder plate.
    blob(g, [{ x: 8, y: 15, rx: 6, ry: 9, h: 6, ey: 4 }], [P.ink, P.s0, P.s1, P.s2, P.s3], { rim: P.orange });
    blob(g, [{ x: 19, y: 17, rx: 14, ry: 11, h: 11, ey: 4 }, { x: 22, y: 8, rx: 9, ry: 5, h: 7, z: 4, ey: 3 }], RAMP.steel, { rim: P.orange });
    // Cockpit glass with Deltron's hood and shades inside.
    blob(g, [{ x: 26, y: 12, rx: 6, ry: 5, h: 4, z: 10, ey: 3 }], RAMP.sea, { rim: P.white });
    ellipse(g, 25, 12, 2.5, 3, P.navy); rect(g, 24, 12, 4, 1, P.ink); px(g, 27, 12, P.cream);
    // Hazard stripe, vents, a stolen security number.
    for (let x = 7; x < 31; x++) rect(g, x, 22, 1, 2, ((x >> 1) % 2) ? P.amber : P.ink);
    for (let y = 13; y < 20; y += 2) rect(g, 10, y, 5, 1, P.s1);
    rect(g, 15, 4, 1, 4, P.s2); px(g, 15, 3, P.red);
    // Shoulder plate and arm cannon.
    blob(g, [{ x: 17, y: 13, rx: 7, ry: 5, h: 5, z: 8, ey: 3 }], RAMP.steel, { rim: P.orange });
    blob(g, [{ x: 31, y: 21, rx: 8, ry: 4, h: 4, z: 7, ey: 3 }], [P.ink, P.s0, P.s1, P.s2, P.s3], { rim: P.orange });
    rect(g, 35, 19, 7, 4, P.s1); rect(g, 35, 19, 7, 1, P.s3); rect(g, 40, 20, 2, 2, P.ink);
    outline(c);
    A.mech = c; A.mechHit = flat(c, P.white);
  }
  A.drone = spr(`
...........
..rr...bb..
...rrrbb...
..sSSSSSs..
.sSSwwwSSs.
sSSSwkwSSSs
.ssSSSSSss.
...s...s...
`, { r: P.red, b: P.cyan, s: P.s1, S: P.s3, w: P.ice, k: P.ink }, { outline: true });
  A.crawler = (() => {
    const [c, g] = canvas(24, 14);
    blob(g, [{ x: 12, y: 9, rx: 11, ry: 5, h: 5 }, { x: 18, y: 6, rx: 5, ry: 5, h: 5, z: 2 }], RAMP.green, { rim: P.lime });
    rect(g, 3, 12, 18, 1, P.forest);
    for (const x of [16, 20]) { rect(g, x, 3, 2, 2, P.white); px(g, x, 4, P.ink); }
    return outline(c);
  })();
  A.barrier = spr(`
yyyyyyyyyyyyyyyy
ykkkyyykkkyyykky
yykkkyyykkkyyyky
yyykkkyyykkkyyyy
yyyyyyyyyyyyyyyy
.s............s.
.s............s.
.s............s.
yyyyyyyyyyyyyyyy
ykkkyyykkkyyykky
yykkkyyykkkyyyky
yyyyyyyyyyyyyyyy
.s............s.
.s............s.
.s............s.
ss............ss
`, { y: P.amber, k: P.ink, s: P.s2 }, { outline: true });
  A.mine = spr(`
..r..
.sSs.
sSSSs
kkkkk
`, { r: P.red, s: P.s1, S: P.s3, k: P.ink }, { outline: true });
  // The Warden: a big police mech.
  {
    const [c, g] = canvas(64, 70);
    blob(g, [{ x: 32, y: 30, rx: 24, ry: 17, h: 16 }, { x: 32, y: 14, rx: 12, ry: 9, h: 8, z: 8 }, { x: 10, y: 34, rx: 9, ry: 12, h: 8, z: 4 }, { x: 54, y: 34, rx: 9, ry: 12, h: 8, z: 4 }], [P.ink, P.navy, P.indigo, '#6f6aa8', P.s4], { rim: P.cyan });
    rect(g, 24, 12, 16, 4, P.ink); rect(g, 25, 13, 6, 2, P.red); rect(g, 33, 13, 6, 2, P.cyan);
    rect(g, 18, 26, 28, 3, P.amber); text(g, 'WARDEN', 32, 25, P.ink, { align: 'center' });
    for (const x of [20, 40]) { rect(g, x, 46, 6, 16, P.s1); rect(g, x - 3, 62, 12, 6, P.s0); rect(g, x, 46, 1, 16, P.s3); }
    rect(g, 2, 36, 8, 5, P.s1); rect(g, 0, 37, 3, 3, P.ink);
    A.boss = outline(c); A.bossHit = flat(A.boss, P.white);
  }
  A.lab = (() => {
    const [c, g] = canvas(80, 100);
    blob(g, [{ x: 40, y: 60, rx: 38, ry: 42, h: 30, ey: 4 }], [P.ink, P.forest, P.teal, P.cyan, P.ice], { rim: P.magenta });
    rect(g, 26, 62, 28, 38, P.ink); rect(g, 28, 64, 24, 36, '#0d1a24');
    for (let y = 66; y < 98; y += 6) rect(g, 30, y, 20, 2, P.teal);
    rect(g, 10, 26, 60, 12, P.ink); text(g, 'AUTOMATOR', 40, 29, P.lime, { align: 'center' });
    return outline(c);
  })();
  return (ART = A);
}

export default {
  id: 'mech', track: 2, song: 's3030', name: '3030', title: 'MECH BREAKOUT',
  blurb: "Prisoner Zero has hijacked a security mech. Stomp across the city to the Automator's lab with the whole planet on your tail.",
  how: ['◀ ▶ MOVE', 'Ⓐ JUMP', 'Ⓑ FIRE (HOLD)', '▲ ▼ AIM HIGH/LOW'],
  par: [2800, 4200, 5300, 6100],
  make(ctx) {
    const A = art(), R = ctx.rng;
    const parts = Particles(), pops = Pops();
    const me = { x: 60, y: GROUND, vy: 0, air: false, hp: MAXHP, inv: 0, walk: 0, fireT: 0, recoil: 0, crouch: false, aim: 0 };
    let cam = 0, t = 0, score = 0, kills = 0, hits = 0, boss = null, bossDown = false, done = false, endT = 0, warn = 0;
    const shots = [], foes = [], bolts = [], kits = [];
    // Level script: waves placed along the street.
    const plan = [];
    for (let x = 360; x < BOSS_X - 150; x += 90 + R() * 70) {
      const z = x / BOSS_X, roll = R();
      if (z < 0.25) plan.push({ k: roll < 0.6 ? 'crawler' : 'barrier', x });
      else if (z < 0.55) plan.push({ k: roll < 0.45 ? 'drone' : roll < 0.8 ? 'crawler' : 'barrier', x });
      else plan.push({ k: roll < 0.35 ? 'drone' : roll < 0.62 ? 'crawler' : roll < 0.75 ? 'mine' : 'barrier', x });
      if (z > 0.4 && R() < 0.3) plan.push({ k: 'drone', x: x + 40 });
    }
    const HP = { crawler: 2, drone: 2, barrier: 5, mine: 99 };
    const box = { crawler: [22, 12], drone: [12, 8], barrier: [16, 18], mine: [6, 4] };
    // Screen-space hit rect of a foe: drones are centred, the rest stand on the street.
    const rectOf = f => { const [bw, bh] = box[f.k], sx = f.x - cam; return f.k === 'drone' ? [sx - bw / 2 - 2, f.y - bh / 2 - 2, sx + bw / 2 + 2, f.y + bh / 2 + 2] : [sx - bw / 2, f.y - bh, sx + bw / 2, f.y]; };

    function hurt(n = 1, why = '?') {
      if (me.inv > 0 || done) return;
      inst.log.push(why + '@' + Math.round(cam));
      me.hp -= n; hits++; me.inv = 1.1;
      ctx.sfx('hurt'); ctx.shake(4); ctx.flash(0.25);
      parts.burst(me.x, me.y - 20, 14, [P.orange, P.amber, P.s3], 90);
      if (me.hp <= 0) { me.hp = 0; ctx.sfx('boom'); parts.burst(me.x, me.y - 16, 40, [P.orange, P.red, P.amber, P.s2], 140, 1); inst.result = { win: false, score, lines: lines() }; done = true; }
    }
    function lines() { return [`DESTROYED  ${kills}`, `ARMOR LEFT ${me.hp}/${MAXHP}`, `HITS TAKEN ${hits}`, bossDown ? 'WARDEN DOWN' : 'WARDEN STANDING']; }
    function kill(f, pts) {
      f.dead = true; kills++; score += pts;
      pops.add('+' + pts, f.x - cam, f.y - 14, P.amber);
      parts.burst(f.x - cam, f.y - 6, 16, [P.orange, P.amber, P.s3, P.red], 100);
      ctx.sfx('boom', 0.6);
      if (f.k === 'drone' && R() < 0.45) kits.push({ x: f.x, y: f.y, vy: -40 });
    }

    const inst = {
      result: null, log: [],
      update(dt) {
        t += dt;
        const [ax] = ctx.I.axis();
        if (!done) {
          // Camera rolls forward except during the Warden fight.
          const lock = boss && !bossDown;
          if (!lock) cam = Math.min(cam + 52 * dt, LAB_X - 150);
          const [, ay] = ctx.I.axis();
          me.crouch = ay > 0 && !me.air; me.aim = ay < 0 ? -1 : me.crouch ? 1 : 0;
          me.x = Math.max(16, Math.min(210, me.x + ax * (me.crouch ? 30 : 80) * dt));
          if (ax !== 0 || !lock) me.walk += dt * (ax > 0 ? 1.4 : ax < 0 ? 0.8 : 1);
          if (ctx.I.hit('a') && !me.air) { me.vy = -235; me.air = true; ctx.sfx('jump'); }
          me.vy += 620 * dt; me.y += me.vy * dt;
          if (me.y >= GROUND) { if (me.air && me.vy > 100) { ctx.shake(1.5); parts.burst(me.x, GROUND, 6, [P.s2, P.s1], 40, 0.3, 60); } me.y = GROUND; me.vy = 0; me.air = false; }
          me.fireT -= dt; me.inv = Math.max(0, me.inv - dt); me.recoil = Math.max(0, me.recoil - dt * 10);
          if (ctx.I.down('b') && me.fireT <= 0) {
            me.fireT = 0.15; me.recoil = 1; ctx.sfx('shoot');
            if (me.aim < 0) shots.push({ x: me.x + 20, y: me.y - 30, vx: 220, vy: -200 });
            else if (me.crouch) shots.push({ x: me.x + 22, y: me.y - 10, vx: 300, vy: 0 });
            else shots.push({ x: me.x + 22, y: me.y - 23, vx: 300, vy: 0 });
          }
        }
        // Spawn.
        while (plan.length && plan[0].x < cam + W + 30) {
          const p = plan.shift();
          const f = { k: p.k, x: p.x, y: p.k === 'drone' ? 104 + R() * 36 : GROUND, hp: HP[p.k], t: R() * 6, shotT: 1.8 + R(), y0: 0 };
          f.y0 = f.y; foes.push(f);
        }
        if (!boss && cam > BOSS_X - W + 40) { boss = { x: BOSS_X, y: GROUND, hp: 26, t: 0, fire: 1.5, flash: 0, hop: 0, vy: 0 }; warn = 2.2; ctx.sfx('alarm'); }
        warn = Math.max(0, warn - dt);
        // Foes.
        for (const f of foes) {
          if (f.dead) continue;
          f.t += dt;
          const sx = f.x - cam;
          if (f.k === 'crawler') f.x -= 26 * dt;
          if (f.k === 'drone') {
            f.y = f.y0 + Math.sin(f.t * 2) * 14; f.x -= (sx > 150 ? 30 : 4) * dt;
            f.shotT -= dt;
            if (f.shotT <= 0 && sx < W - 10 && sx > me.x + 10 && sx - me.x < 175) {
              f.shotT = 2.6 + R() * 0.9;
              const dx = me.x - sx, dy = (me.y - 18) - f.y, d = Math.hypot(dx, dy);
              bolts.push({ x: f.x, y: f.y, vx: dx / d * 78, vy: dy / d * 78 }); ctx.sfx('zap', 0.6);
            }
          }
          if (sx < -40) f.dead = true;
          // Contact.
          const [bw, bh] = box[f.k];
          if (!done && f.k === 'crawler' && me.air && me.vy > 60 && Math.abs(sx - me.x) < 16 && me.y > f.y - 16 && me.y < f.y - 2) {
            me.vy = -170; kill(f, 150); pops.add('STOMP', sx, f.y - 26, P.lime); continue;
          }
          if (!done && Math.abs(sx - me.x) < (f.k === 'mine' ? 9 : bw / 2 + 12) && (f.k === 'drone' ? f.y + bh / 2 : f.y) - bh < me.y && (f.k === 'drone' ? f.y + bh / 2 : f.y) > me.y - (me.crouch ? 22 : 34) + 6) {
            if (f.k === 'mine') { f.dead = true; ctx.sfx('boom'); parts.burst(sx, f.y - 2, 20, [P.orange, P.amber, P.red], 110); hurt(1, 'mine'); }
            else { hurt(1, f.k); if (f.k === 'barrier' || f.k === 'crawler') me.x = Math.max(16, me.x - 14); }
          }
        }
        // Boss.
        if (boss && !bossDown) {
          boss.t += dt; boss.flash = Math.max(0, boss.flash - dt * 6);
          const bx = boss.x - cam;
          boss.x += Math.sin(boss.t * 0.8) * 14 * dt;
          boss.fire -= dt;
          if (boss.fire <= 0 && warn <= 0) {
            boss.fire = boss.hp > 13 ? 1.7 : 1.15;
            for (const a of [-0.25, 0, 0.25]) { const ang = Math.PI + a + (boss.t % 2 < 1 ? 0.12 : -0.05); bolts.push({ x: boss.x - 30, y: boss.y - 34, vx: Math.cos(ang) * 92, vy: Math.sin(ang) * 92 }); }
            ctx.sfx('zap');
          }
          if (boss.hp <= 13 && boss.hop <= 0 && boss.t % 4 < dt) { boss.vy = -200; boss.hop = 1; }
          if (boss.hop) { boss.vy += 500 * dt; boss.y += boss.vy * dt; if (boss.y >= GROUND) { boss.y = GROUND; boss.vy = 0; boss.hop = 0; ctx.shake(5); ctx.sfx('boom', 0.7); if (!me.air) hurt(1, 'stomp'); } }
          if (!done && Math.abs(bx - me.x) < 30 && me.y > boss.y - 60) hurt(1, 'boss');
        }
        // Shots.
        for (const s of shots) {
          s.x += s.vx * dt; s.y += s.vy * dt;
          for (const f of foes) {
            if (f.dead || s.dead || f.k === 'mine') continue;
            const [x0, y0, x1, y1] = rectOf(f);
            if (s.x > x0 - 3 && s.x < x1 + 3 && s.y > y0 - 2 && s.y < y1 + 2) {
              s.dead = true; f.hp--; parts.burst(s.x, s.y, 4, [P.cream, P.amber], 50, 0.25);
              if (f.hp <= 0) kill(f, { crawler: 100, drone: 150, barrier: 60 }[f.k]); else ctx.sfx('brick', 0.6);
            }
          }
          if (boss && !bossDown && !s.dead) {
            const bx = boss.x - cam;
            if (Math.abs(s.x - bx) < 26 && s.y > boss.y - 64 && s.y < boss.y) {
              s.dead = true; boss.hp--; boss.flash = 1; parts.burst(s.x, s.y, 5, [P.cyan, P.white], 60, 0.3); ctx.sfx('brick', 0.7);
              if (boss.hp <= 0) {
                bossDown = true; score += 2000; kills++;
                pops.add('+2000', bx, boss.y - 70, P.amber, 1.5);
                for (let i = 0; i < 5; i++) parts.burst(bx + (i - 2) * 10, boss.y - 30 - i * 6, 24, [P.orange, P.amber, P.red, P.cyan], 150, 1.1);
                ctx.sfx('boom'); ctx.shake(8); ctx.flash(0.8);
              }
            }
          }
          if (s.x > W + 10 || s.y < 0) s.dead = true;
        }
        for (const b of bolts) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          const bx = b.x - cam;
          if (!done && Math.abs(bx - me.x) < 13 && b.y > me.y - (me.crouch ? 22 : 34) && b.y < me.y - 2) { b.dead = true; hurt(1, 'bolt'); }
          if (bx < -10 || bx > W + 10 || b.y > H || b.y < 0) b.dead = true;
        }
        for (const arr of [shots, foes, bolts]) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].dead) arr.splice(i, 1);
        for (const k of kits) {
          k.vy += 300 * dt; k.y = Math.min(GROUND - 4, k.y + k.vy * dt);
          const kx = k.x - cam;
          if (!done && Math.abs(kx - me.x) < 16 && k.y > me.y - 40) { k.dead = true; me.hp = Math.min(MAXHP, me.hp + 1); score += 50; ctx.sfx('power'); pops.add('ARMOR +1', kx, k.y - 10, P.lime); }
          if (kx < -20) k.dead = true;
        }
        for (let i = kits.length - 1; i >= 0; i--) if (kits[i].dead) kits.splice(i, 1);
        // The lab: walk in to win.
        if (!done && bossDown && me.x + cam > LAB_X - 10) {
          done = true; score += me.hp * 200;
          pops.add('ARMOR +' + me.hp * 200, me.x, me.y - 50, P.lime, 1.4);
          inst.result = { win: true, score, lines: lines() };
        }
        parts.update(dt); pops.update(dt);
      },
      draw(g) {
        // Sky: blood-red manhunt night.
        sky(g, 0, 150, [P.ink, P.deep, '#2a0d22', P.blood, '#a8343f']);
        stars(g, t, { n: 40, seed: 30, y1: 80, drift: cam * 0.02 });
        ellipse(g, 200 - cam * 0.01, 34, 13, 13, P.cream); ellipse(g, 204 - cam * 0.01, 31, 11, 11, '#f6e2b8');
        g.drawImage(perisphere(16, [P.ink, P.deep, '#2a0d22', P.blood, P.red], P.orange), 30 - cam * 0.03, 60);
        for (const [x, s] of [[50, 0.6], [140, -0.5], [230, 0.4]]) {
          const a = -Math.PI / 2 + Math.sin(t * s + x) * 0.6, dx = Math.cos(a), dy = Math.sin(a);
          g.globalAlpha = 0.12; poly(g, [[x, 160], [x + dx * 190 - dy * 12, 160 + dy * 190 + dx * 12], [x + dx * 190 + dy * 12, 160 + dy * 190 - dx * 12]], P.cream); g.globalAlpha = 1;
        }
        drawStrip(g, skyline(301, 70, '#1a0a1a', P.blood), cam * 0.2, 84);
        drawStrip(g, skyline(302, 56, '#12060f', P.amber, { tall: 1.1 }), cam * 0.45, 112);
        rect(g, 0, 168, W, GROUND - 168, '#1d1726');
        for (let x = -((cam) % 24); x < W; x += 24) rect(g, x, 168, 1, GROUND - 168, '#2a2236');
        rect(g, 0, 168, W, 1, '#2f2640'); rect(g, 0, GROUND - 3, W, 3, P.s0);
        // WANTED billboard drifting by.
        const bbx = 260 - ((cam * 0.45) % 700);
        rect(g, bbx, 116, 54, 30, P.ink); rect(g, bbx + 2, 118, 50, 26, P.cream);
        text(g, 'WANTED', bbx + 27, 120, P.red, { align: 'center' }); text(g, 'DELTRON 0', bbx + 27, 131, P.ink, { align: 'center' });
        rect(g, bbx + 24, 146, 4, 22, P.ink);
        // Street.
        rect(g, 0, GROUND, W, H - GROUND, '#16121c');
        rect(g, 0, GROUND, W, 2, P.s1);
        for (let x = -((cam) % 40); x < W; x += 40) rect(g, x, GROUND + 14, 20, 2, P.amber);
        for (let x = -((cam * 1.3) % 120); x < W; x += 120) { rect(g, x, 120, 3, GROUND - 120, P.s0); rect(g, x - 6, 118, 15, 3, P.s1); ellipse(g, x + 1, 122, 4, 2, P.cream); g.globalAlpha = 0.1; poly(g, [[x - 2, 122], [x - 20, GROUND], [x + 24, GROUND]], P.cream); g.globalAlpha = 1; }
        // Lab at the end.
        if (cam > LAB_X - W - 100) g.drawImage(A.lab, Math.round(LAB_X - cam - 20), GROUND - 100);
        // Foes.
        for (const f of foes) {
          const sx = Math.round(f.x - cam);
          if (f.k === 'crawler') g.drawImage(A.crawler, sx - 12, f.y - 14 + Math.round(Math.sin(f.t * 8)));
          if (f.k === 'drone') { g.drawImage(A.drone, sx - 6, Math.round(f.y) - 5); if ((f.t * 6 | 0) % 2) { rect(g, sx - 4, Math.round(f.y) - 5, 2, 1, P.red); } }
          if (f.k === 'barrier') g.drawImage(A.barrier, sx - 9, f.y - 18);
          if (f.k === 'mine') { g.drawImage(A.mine, sx - 4, f.y - 6); if ((f.t * 3 | 0) % 2) px(g, sx - 1, f.y - 6, P.white); }
        }
        if (boss && !bossDown) {
          const bx = Math.round(boss.x - cam);
          g.drawImage(boss.flash > 0.85 && (t * 30 | 0) % 2 ? A.bossHit : A.boss, bx - 32, Math.round(boss.y) - 70);
          if ((t * 4 | 0) % 2) { rect(g, bx - 8, Math.round(boss.y) - 70, 6, 3, P.red); rect(g, bx + 2, Math.round(boss.y) - 70, 6, 3, P.cyan); }
          rect(g, 60, 20, 136, 6, P.ink); rect(g, 61, 21, 134 * boss.hp / 26, 4, P.red); text(g, 'WARDEN', 128, 28, P.s3, { align: 'center' });
        }
        // Mech: legs swing with the walk phase.
        if (!(me.hp <= 0)) {
          const blink = me.inv > 0 && (t * 16 | 0) % 2;
          const ph = me.walk * 7, base = Math.round(me.y), lift = me.crouch ? 9 : 0;
          for (const s of [0, 1]) {
            const a = Math.sin(ph + s * Math.PI) * (me.air ? 0.2 : 0.55), kx = me.x - 4 + s * 8;
            const knee = [kx + Math.sin(a) * 9 + (me.crouch ? 7 : 0), base - 13 + lift * 0.6], foot = [kx + Math.sin(a) * 4 - 2, base - (me.air ? 3 : Math.max(0, Math.cos(ph + s * Math.PI)) * 3)];
            const col = s ? P.s2 : P.s1, hi = s ? P.s3 : P.s2;
            for (let k = -2; k <= 2; k++) { line(g, kx + k, base - 22 + lift, knee[0] + k, knee[1], k === -2 ? hi : col); line(g, knee[0] + k * 0.7, knee[1], foot[0] + k * 0.7, foot[1], k <= -1 ? hi : col); }
            line(g, kx + 3, base - 20 + lift, foot[0] + 3, foot[1] - 4, P.s0);
            ellipse(g, knee[0], knee[1], 3, 3, P.s0); px(g, knee[0] - 1, knee[1] - 1, P.s3);
            rect(g, foot[0] - 6, foot[1] - 2, 13, 4, P.ink); rect(g, foot[0] - 5, foot[1] - 2, 11, 3, P.s1); rect(g, foot[0] - 5, foot[1] - 2, 11, 1, P.s3);
          }
          const bob = me.air ? 0 : Math.round(Math.abs(Math.sin(ph)) * 1.5);
          if (!blink) g.drawImage(me.inv > 0.9 ? A.mechHit : A.mech, Math.round(me.x - 19 - me.recoil), base - 46 + bob + lift);
          const my = me.aim < 0 ? me.y - 30 : me.crouch ? me.y - 12 : me.y - 23;
          if (me.aim < 0) { line(g, me.x + 14, me.y - 24, me.x + 20, me.y - 30, P.s3); line(g, me.x + 15, me.y - 24, me.x + 21, me.y - 30, P.s1); }
          if (me.recoil > 0.5) { ellipse(g, me.x + 23, my, 3, 2, P.amber); px(g, me.x + 26, my, P.white); }
        }
        for (const s of shots) { if (s.vy) { line(g, s.x - 4, s.y + 4, s.x, s.y, P.amber); px(g, s.x, s.y, P.white); } else { rect(g, s.x - 4, s.y - 1, 8, 2, P.amber); rect(g, s.x, s.y - 1, 4, 2, P.white); } }
        for (const k of kits) { const kx = Math.round(k.x - cam), ky = Math.round(k.y); rect(g, kx - 5, ky - 5, 10, 9, P.ink); rect(g, kx - 4, ky - 4, 8, 7, P.s4); rect(g, kx - 1, ky - 3, 2, 5, P.red); rect(g, kx - 3, ky - 1, 6, 2, P.red); }
        for (const b of bolts) { const bx = Math.round(b.x - cam); g.globalAlpha = 0.4; ellipse(g, bx - b.vx * 0.05, b.y - b.vy * 0.05, 2, 2, P.orange); g.globalAlpha = 1; ellipse(g, bx, b.y, 3, 3, P.orange); px(g, bx - 1, b.y - 1, P.cream); }
        parts.draw(g); pops.draw(g);
        // HUD.
        topBar(g, 'TRACK 02  3030', score, '');
        for (let i = 0; i < MAXHP; i++) { rect(g, 96 + i * 9, 3, 7, 6, P.ink); rect(g, 97 + i * 9, 4, 5, 4, i < me.hp ? (me.hp <= 2 ? P.red : P.lime) : P.s0); }
        const prog = Math.min(1, cam / (LAB_X - 150));
        rect(g, 8, 216, 240, 3, P.s0); rect(g, 8, 216, 240 * prog, 3, P.amber); rect(g, 8 + 240 * (BOSS_X - W + 40) / (LAB_X - 150), 214, 1, 7, P.red);
        if (warn > 0 && (t * 5 | 0) % 2) banner(g, 'WARNING', 92, P.red);
        if (bossDown && !done && (t * 3 | 0) % 2) text(g, 'GET TO THE LAB ▶', W / 2, 40, P.lime, { align: 'center', shadow: P.ink });
      },
      // Bot: fire always, keep near x=70, jump threats on the ground and incoming bolts.
      auto() {
        const out = ['b'];
        const target = boss && !bossDown ? 60 : bossDown ? 240 : 70;
        if (me.x < target - 6) out.push('right'); else if (me.x > target + 6) out.push('left');
        let jump = false, low = false, high = false;
        for (const f of foes) {
          if (f.dead) continue;
          const sx = f.x - cam, d = sx - me.x;
          if (f.k === 'mine' && d > 6 && d < 38) jump = true;
          if ((f.k === 'crawler' || f.k === 'barrier') && d > 0 && d < 150) low = true;
          if ((f.k === 'crawler' || f.k === 'barrier') && d > 4 && d < 26) jump = true;
          if (f.k === 'drone' && d > -10 && d < 170) high = true;
        }
        let duck = false;
        for (const b of bolts) {
          const bx = b.x - cam, d = bx - me.x;
          if (b.vx >= 0 || d < -8 || d > 70) continue;
          const tArr = Math.max(0, d / -b.vx), yArr = b.y + b.vy * tArr;
          if (yArr > GROUND - 34 && yArr < GROUND - 2) { if (yArr < GROUND - 22) duck = true; else if (d < 50) jump = true; }
        }
        if (me.air) { out.push('right'); }
        if (duck && !jump && !me.air) { out.push('down'); return out; }
        if (jump && !me.air && (t * 60 | 0) % 2) out.push('a');
        else if (high && !low) out.push('up');
        else if (low && !jump && !me.air) out.push('down');
        return out;
      },
    };
    return inst;
  },
};
