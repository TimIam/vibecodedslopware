// UNSUBSCRIBE: a fixed shooter against your own inbox. Mail swoops in, lines up and dive-bombs you.
import { W, H, C, spr, particles } from '../gfx.js';

const SHIP = spr(['.......w.......', '.......w.......', '......lwl......', '.....blllb.....', '....bbwlwbb....', '...bbbbwbbbb...', '..bbbbbbbbbbb..', '.bbcbbbbbbbcbb.', 'bbbcbbr.rbbcbbb', 'bb.c.......c.bb']);
const MAIL = [spr(['GwwwwwwwwwwG', 'wGwwwwwwwwGw', 'wwGGwwwwGGww', 'wwwwGwwGwwww', 'wwwwwGGwwwww', 'wwwwwwwwwwww', 'wwwwwwwwwwww', 'GwwwwwwwwwwG']),
  spr(['.....GG.....', '...GGwwGG...', '.GGwwwwwwGG.', 'GwwwwwwwwwwG', 'wGGwwwwwwGGw', 'wwwGGwwGGwww', 'wwwwwGGwwwww', 'GwwwwwwwwwwG'])];
const NEWS = [spr(['ccccccccccccc', 'cBBBBBcwwwwwc', 'cBBBBBcwwwwwc', 'cBBBBBcccccc.', 'cBBBBBcwwwwwc', 'cwwwwwwwwwwwc', 'cwwwwwwwwwwwc', 'ccccccccccccc']),
  spr(['ccccccccccccc', 'cwwwwwwwwwwwc', 'cwwwwwwwwwwwc', 'cBBBBBcwwwwwc', 'cBBBBBcccccc.', 'cBBBBBcwwwwwc', 'cBBBBBcwwwwwc', 'ccccccccccccc'])];
const CHAIN = [spr(['oo.oo.oo.oo.', 'oyoyoyoyoyoy', 'oo.oo.oo.oo.', '............', 'ywwwwwwwwwwy', 'ywkkwkkwkkwy', 'ywwwwwwwwwwy', 'yyyyyyyyyyyy']),
  spr(['.oo.oo.oo.oo', 'yoyoyoyoyoyo', '.oo.oo.oo.oo', '............', 'ywwwwwwwwwwy', 'ywwkkwkkwkwy', 'ywwwwwwwwwwy', 'yyyyyyyyyyyy'])];
const BOSS = [spr(['....rrrrrrrrrrrr....', '..rrRRRRRRRRRRRRrr..', '.rRRRwwRRRRRRwwRRRr.', 'rRRRwkkwRRRRwkkwRRRr', 'rRRRwkkwRRRRwkkwRRRr', 'rRRRRwwRRRRRRwwRRRRr', 'rRRRRRRRRRRRRRRRRRRr', 'rRRwwwwwwwwwwwwwwRRr', 'rRRwRwRwRwRwRwRwwRRr', '.rRwwwwwwwwwwwwwwRr.', '..rrRRRRRRRRRRRRrr..', '....rrrrrrrrrrrr....']),
  spr(['....rrrrrrrrrrrr....', '..rrRRRRRRRRRRRRrr..', '.rRRRwwRRRRRRwwRRRr.', 'rRRRwkkwRRRRwkkwRRRr', 'rRRRwkkwRRRRwkkwRRRr', 'rRRRRwwRRRRRRwwRRRRr', 'rRRRRwwwwwwwwwwRRRRr', 'rRRRwRwRwRwRwRwwRRRr', 'rRRRwwwwwwwwwwwwRRRr', '.rRRwRwRwRwRwRwwRRr.', '..rrRwwwwwwwwwwRrr..', '....rrrrrrrrrrrr....'])];
const MINI = [spr(['yyyyyyy', 'ywkwkwy', 'yyyyyyy']), spr(['yyyyyyy', 'ykwkwky', 'yyyyyyy'])];
const JUNK = ['RE: RE: FW: FW: ACT NOW', 'YOUR CART MISSES YOU', 'WE VALUE YOUR PRIVACY', 'FINAL NOTICE (3RD)', 'QUICK QUESTION', 'CIRCLING BACK', 'JUST BUMPING THIS', 'ONE WEIRD TRICK', '40% OFF SOCKS', 'WEEKLY DIGEST', 'PER MY LAST EMAIL', 'YOU HAVE BEEN SELECTED'];

const KIND = {
  mail: { art: MAIL, hp: 1, pts: 50, dive: 100 },
  news: { art: NEWS, hp: 1, pts: 80, dive: 160 },
  chain: { art: CHAIN, hp: 1, pts: 120, dive: 200 },
  boss: { art: BOSS, hp: 3, pts: 300, dive: 600 },
  mini: { art: MINI, hp: 1, pts: 60, dive: 60 },
};

export default {
  id: 'unsubscribe', title: 'UNSUBSCRIBE', genre: 'SPACE SHOOTER',
  blurb: 'Your inbox has achieved flight. Shoot it down. Chain letters split. REPLY ALL takes three hits.',
  controls: ['LEFT RIGHT MOVE, Z FIRE', 'X UNSUBSCRIBE ALL (LIMITED)'],
  create(a) {
    const fx = particles(a);
    const ship = { x: 120, y: 214, inv: 90 };
    let wave = 0, lives = 3, bombs = 2, shots = [], hostile = [], foes = [], pending = [], clearT = 0, banner = 0, flash = 0, diveT = 120, fireCd = 0, deadT = 0, scroll = 0;
    const junkRows = Array.from({ length: 16 }, (_, i) => ({ text: a.pick(JUNK), x: a.rint(90) }));
    const sway = () => Math.sin(a.t / 50) * 14;

    function loadWave() {
      wave++; banner = 100; pending = []; foes = [];
      const rows = [['boss', 34, [3, 4]], ['chain', 52, [1, 6]], ['news', 68, [0, 7]], ['mail', 84, [0, 7]], ['mail', 100, [1, 6]]];
      if (wave === 1) rows.shift();
      let group = 0, delay = 40;
      rows.forEach(([kind, y, [c0, c1]]) => {
        const half = (c1 - c0 + 1) * 22 / 2;
        for (let c = c0; c <= c1; c++) {
          const slotX = 128 - half + (c - c0) * 22 + 11;
          pending.push({ kind, slotX, slotY: y, at: delay + (c - c0) * 9, side: group & 1 });
        }
        delay += (c1 - c0 + 1) * 9 + 30; group++;
      });
    }

    function spawn(p) {
      const dir = p.side ? -1 : 1, sx = p.side ? W + 12 : -12;
      const f = { kind: p.kind, def: KIND[p.kind], hp: KIND[p.kind].hp, x: sx, y: 170, ang: p.side ? Math.PI : 0, slotX: p.slotX, slotY: p.slotY, st: 'enter', wp: [], spd: 2.6 };
      f.wp = [{ x: 128 + dir * 70, y: 130 }, { x: 128 - dir * 40, y: 60 }, { slot: true }];
      foes.push(f);
    }
    const slot = f => ({ x: f.slotX + sway() - f.def.art[0].w / 2, y: f.slotY });

    function steer(f, maxTurn) {
      const w = f.wp[0];
      const tgt = w.slot ? slot(f) : w;
      const dx = tgt.x - f.x, dy = tgt.y - f.y, d = Math.hypot(dx, dy);
      if (d < f.spd + 5) { f.wp.shift(); return !f.wp.length; }
      let diff = Math.atan2(dy, dx) - f.ang;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      f.ang += Math.max(-maxTurn, Math.min(maxTurn, diff * (d < 40 ? 1 : .5)));
      f.x += Math.cos(f.ang) * f.spd; f.y += Math.sin(f.ang) * f.spd;
      return false;
    }

    function dive(f) {
      f.st = 'dive'; f.spd = 2.2 + Math.min(wave * .12, 1.2);
      const dir = a.chance(.5) ? 1 : -1;
      f.wp = [{ x: f.x + dir * 34, y: f.y + 26 }, { x: ship.x, y: 140 }, { x: ship.x + dir * 30, y: 196 }, { x: ship.x - dir * 20, y: H + 24 }];
      f.ang = Math.PI / 2; f.shots = 1 + (wave > 3 ? 1 : 0); a.sfx('hit');
    }
    function fireAt(f) {
      const sx = f.x + f.def.art[0].w / 2, sy = f.y + 8, dx = ship.x + 7 - sx, dy = ship.y - sy, d = Math.hypot(dx, dy) || 1, v = 1.7 + Math.min(wave * .08, .8);
      hostile.push({ x: sx, y: sy, vx: dx / d * v, vy: Math.max(dy / d * v, .9) });
    }
    function kill(f, viaBomb) {
      foes.splice(foes.indexOf(f), 1);
      const pts = f.def.pts * (f.st === 'dive' ? 2 : 1);
      a.add(pts); fx.pop(pts, f.x + 6, f.y, f.st === 'dive' ? C.y : C.G, 26);
      fx.burst(f.x + 6, f.y + 4, [C.w, C.G, f.kind === 'boss' ? C.r : C.c], f.kind === 'boss' ? 26 : 12, 1.8, 22, 0);
      a.sfx(f.kind === 'boss' ? 'boom' : 'crunch');
      if (f.kind === 'chain' && !viaBomb) for (const dir of [-1, 1]) {
        foes.push({ kind: 'mini', def: KIND.mini, hp: 1, x: f.x + dir * 4, y: f.y, ang: Math.PI / 2, st: 'dive', spd: 2.5, oneway: true, shots: 0, wp: [{ x: f.x + dir * 34, y: f.y + 30 }, { x: f.x + dir * 12, y: H + 24 }] });
      }
      if (f.kind === 'boss') a.shake(5);
    }
    function die() {
      lives--; deadT = 90; a.sfx('die'); a.shake(7);
      fx.burst(ship.x + 7, ship.y + 5, [C.b, C.c, C.w], 30, 2.2, 36, .02);
      hostile = [];
      if (lives <= 0) a.over(`REACHED WAVE ${wave}`);
    }
    function bomb() {
      bombs--; flash = 14; a.sfx('boom'); a.shake(8); hostile = [];
      for (const f of [...foes]) { f.hp -= 2; if (f.hp <= 0) kill(f, true); }
    }
    loadWave();

    return {
      update() {
        fx.update(); scroll = (scroll + .5) % 14;
        if (flash) flash--;
        if (banner) banner--;
        if (fireCd) fireCd--;
        if (ship.inv) ship.inv--;
        if (deadT) { if (--deadT === 0 && lives > 0) { ship.x = 120; ship.inv = 120; } }
        else {
          const v = a.held('left') ? -2.5 : a.held('right') ? 2.5 : 0;
          ship.x = Math.max(4, Math.min(W - 19, ship.x + v));
          if (a.held('a') && !fireCd && shots.length < 3) { shots.push({ x: ship.x + 6, y: ship.y - 4 }); fireCd = 11; a.sfx('shoot'); }
          if (a.hit('b') && bombs > 0) bomb();
        }

        for (let i = pending.length - 1; i >= 0; i--) if (--pending[i].at <= 0) { spawn(pending[i]); pending.splice(i, 1); }

        const formed = foes.filter(f => f.st === 'form');
        if (--diveT <= 0 && formed.length && !deadT) {
          diveT = Math.max(28, 90 - wave * 7) + a.rint(40);
          dive(a.pick(formed));
          if (wave > 2 && formed.length > 2 && a.chance(.4)) dive(a.pick(foes.filter(f => f.st === 'form')));
        }

        for (const f of [...foes]) {
          if (f.st === 'form') {
            const s = slot(f); f.x += (s.x - f.x) * .25; f.y += (s.y - f.y) * .25;
          } else if (steer(f, f.st === 'dive' ? .09 : .16)) {
            if (f.st === 'enter') f.st = 'form';
            else if (f.oneway) { foes.splice(foes.indexOf(f), 1); continue; }
            else { f.st = 'enter'; f.y = -14; f.x = f.slotX; f.ang = Math.PI / 2; f.spd = 2.6; f.wp = [{ slot: true }]; }
          }
          if (f.st === 'dive' && f.shots > 0 && f.y > 70 && f.y < 150 && a.chance(.05)) { f.shots--; fireAt(f); }
          if (!deadT && !ship.inv && f.x + 10 > ship.x + 2 && f.x < ship.x + 13 && f.y + 7 > ship.y + 2 && f.y < ship.y + 10) { kill(f, true); die(); }
        }

        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i]; s.y -= 5;
          if (s.y < 12) { shots.splice(i, 1); continue; }
          const f = foes.find(q => s.x + 2 > q.x && s.x < q.x + q.def.art[0].w && s.y < q.y + q.def.art[0].h && s.y + 6 > q.y);
          if (f) { shots.splice(i, 1); if (--f.hp <= 0) kill(f); else { a.sfx('hit'); fx.burst(s.x, s.y, C.w, 4, 1, 12, 0); } }
        }
        for (let i = hostile.length - 1; i >= 0; i--) {
          const b = hostile[i]; b.x += b.vx; b.y += b.vy;
          if (b.y > H || b.x < -4 || b.x > W + 4) { hostile.splice(i, 1); continue; }
          if (!deadT && !ship.inv && b.x + 3 > ship.x + 3 && b.x < ship.x + 12 && b.y + 6 > ship.y + 2 && b.y < ship.y + 10) { die(); break; }
        }

        if (!foes.length && !pending.length && !clearT && lives > 0) { clearT = 110; a.add(wave * 500); a.sfx('level'); }
        if (clearT && --clearT === 0) { if (wave % 3 === 0) bombs = Math.min(bombs + 1, 3); loadWave(); }
      },
      draw(g) {
        g.clear('#0a0e24');
        junkRows.forEach((r, i) => g.text(r.text, r.x, 8 + i * 14 + scroll, '#1a2244'));
        const fr = (a.t >> 4) & 1;
        for (const f of foes) g.spr(f.def.art[fr], f.x, f.y);
        for (const s of shots) { g.rect(s.x, s.y, 2, 6, C.l); g.rect(s.x - 1, s.y + 3, 1, 1, C.l); }
        for (const b of hostile) { g.rect(b.x, b.y, 3, 4, C.r); g.rect(b.x + 1 - 1, b.y + 5, 3, 1, C.o); }
        if (!deadT && !(ship.inv & 4)) g.spr(SHIP, ship.x, ship.y);
        fx.draw(g);
        if (flash) g.rect(0, 10, W, H - 10, flash & 2 ? '#f6f6ee90' : '#4cc8e860');
        for (let i = 0; i < lives - 1; i++) g.rect(4 + i * 8, H - 8, 6, 5, C.b);
        for (let i = 0; i < bombs; i++) g.text('@', W - 10 - i * 8, H - 9, C.c);
        if (banner > 40) g.center(`WAVE ${wave}`, 116, C.y, 2);
        if (clearT) g.center('INBOX ZERO', 110, C.l, 2);
      },
      bot() {
        const out = { a: !a.held('a') };
        const cx = ship.x + 7;
        const threat = hostile.find(b => b.y > 120 && Math.abs(b.x - cx) < 14);
        if (threat) { if (threat.x > cx) out.left = true; else out.right = true; return out; }
        const dive2 = foes.find(f => f.st === 'dive' && f.y > 150 && Math.abs(f.x + 6 - cx) < 20);
        if (dive2) { if (dive2.x > ship.x) out.left = true; else out.right = true; return out; }
        const t = foes.filter(f => f.y > 20).sort((p, q) => q.y - p.y)[0];
        if (t) { const tx = t.x + t.def.art[0].w / 2; out.left = tx < cx - 4; out.right = tx > cx + 4; }
        if (foes.length > 16 && ship.inv === 0 && bombs > 1 && a.t % 900 === 0) out.b = true;
        return out;
      },
      state: () => ({ wave, lives, bombs, foes: foes.length }),
    };
  },
};
