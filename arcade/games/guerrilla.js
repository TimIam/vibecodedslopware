// GUERRILLA MARKETING: an actual gorilla shoots bananas up through a hostile trade show.
import { W, H, C, spr, particles } from '../gfx.js';

const T = 16, COLS = 16;
const GROUND = 0, PALM = 1, WALL = 2, WATER = 3, BRIDGE = 4, CRATE = 5, BAGS = 6;
const walkBlock = t => t === PALM || t === WALL || t === WATER || t === CRATE || t === BAGS;
const shotBlock = t => t === PALM || t === WALL || t === CRATE;

const APE = [spr(['....KKKKKK....', '...KKKKKKKK...', '..KKKttttKKK..', '..KKtkttktKK..', '..KKttttttKK..', '...KKtkktKK...', '..rrKKKKKKrr..', '.KKKKwwwwKKKK.', 'KKKKKwrrwKKKKK', 'KK.KKwrrwKK.KK', 'KK.KKwrrwKK.KK', 'tt.KKKKKKKK.tt', '...KKK..KKK...', '...KKK..KKK...', '..KKK....KK...']),
  spr(['....KKKKKK....', '...KKKKKKKK...', '..KKKttttKKK..', '..KKtkttktKK..', '..KKttttttKK..', '...KKtkktKK...', '..rrKKKKKKrr..', '.KKKKwwwwKKKK.', 'KKKKKwrrwKKKKK', 'KK.KKwrrwKK.KK', 'KK.KKwrrwKK.KK', 'tt.KKKKKKKK.tt', '...KKK..KKK...', '...KK...KKK...', '...KK....KKK..'])];
const SUIT = [spr(['...kkkk...', '..kttttk..', '..tkttkt..', '..tttttt..', '...tttt...', '..KKwwKK..', '.KKKwrKKK.', '.KKKwrKKK.', '.tKKyyKKt.', '..KKKKKK..', '..KK..KK..', '..kk..kk..']),
  spr(['...kkkk...', '..kttttk..', '..tkttkt..', '..tttttt..', '...tttt...', '..KKwwKK..', '.KKKwrKKK.', '.KKKwrKKK.', '.tKKyyKKt.', '..KKKKKK..', '...KK.KK..', '...kk..kk.'])];
const DRONE = [spr(['K.......K', '.K.ggg.K.', '..KgrgK..', '.K.ggg.K.', 'K.......K']), spr(['.K.....K.', 'K..ggg..K', '..KgrgK..', 'K..ggg..K', '.K.....K.'])];
const KIOSK = spr(['bbbbbbbbbbbbbbbb', 'bwwwwwwwwwwwwwwb', 'bwBBwwBBwwBBwwwb', 'bwwwwwwwwwwwwwwb', 'bbbbbbbbbbbbbbbb', 'KKKKKKKKKKKKKKKK', 'KggggggggggggggK', 'KgGGGGGrrGGGGGgK', 'KgGGGGrkkrGGGGgK', 'KgGGGGrkkrGGGGgK', 'KgGGGGGrrGGGGGgK', 'KggggggggggggggK', 'KKKKKKKKKKKKKKKK', 'nnnnnnnnnnnnnnnn', 'NNNNNNNNNNNNNNNN', 'NNNNNNNNNNNNNNNN']);
const TILES = {
  [PALM]: spr(['.....eeeee......', '...eeEEEEEee....', '.eeEEEeEeEEEee..', 'eeEEeEEEEEeEEEee', 'eEEEEEEnEEEEEEEe', '.eEEeeEnEeeEEEe.', '..ee..EnE..eee..', '......nnn.......', '......nNn.......', '......nnn.......', '......nNn.......', '......nnn.......', '.....nnNnn......', '.....NNNNN......', '................', '................']),
  [WALL]: spr(['PPPPPPPPPPPPPPPP', 'PmmmmmmmmmmmmmmP', 'PmPPPPPPPPPPPPmP', 'PmPyyPPwPwwPPPmP', 'PmPPPPPPPPPPPPmP', 'PmmmmmmmmmmmmmmP', 'PPPPPPPPPPPPPPPP', 'KKKKKKKKKKKKKKKK', 'KggKggKggKggKggK', 'KggKggKggKggKggK', 'KKKKKKKKKKKKKKKK', 'KggKggKggKggKggK', 'KggKggKggKggKggK', 'KKKKKKKKKKKKKKKK', 'NNNNNNNNNNNNNNNN', 'NNNNNNNNNNNNNNNN']),
  [CRATE]: spr(['NNNNNNNNNNNNNNNN', 'NnnnnnnnnnnnnnnN', 'NnYnnnnnnnnnnYnN', 'NnnYnnnnnnnnYnnN', 'NnnnYnnnnnnYnnnN', 'NnnnnYnnnnYnnnnN', 'NnnnnnYnnYnnnnnN', 'NnnnnnnYYnnnnnnN', 'NnnnnnnYYnnnnnnN', 'NnnnnnYnnYnnnnnN', 'NnnnnYnnnnYnnnnN', 'NnnnYnnnnnnYnnnN', 'NnnYnnnnnnnnYnnN', 'NnYnnnnnnnnnnYnN', 'NnnnnnnnnnnnnnnN', 'NNNNNNNNNNNNNNNN']),
  [BAGS]: spr(['................', '..ttt..ttt..ttt.', '.tYYYtYYYtYYYYt.', '.tYYYtYYYtYYYYt.', '..ttt..ttt..ttt.', 'ttt..ttt..ttt...', 'YYYtYYYtYYYYt...', 'YYYtYYYtYYYYt...', 'ttt..ttt..ttt...', '..ttt..ttt..ttt.', '.tYYYtYYYtYYYYt.', '.tYYYtYYYtYYYYt.', '..ttt..ttt..ttt.', '................', '................', '................']),
};
const BANANA = spr(['y...', 'yy..', '.yy.', '..yY']);
const COCO = spr(['.NnN.', 'NnNnN', 'nNnNn', 'NnNnN', '.NnN.']);
const PICK = { S: { col: C.c, name: 'SPREAD' }, R: { col: C.o, name: 'RAPID' }, G: { col: C.n, name: '+3 COCONUTS' }, L: { col: C.r, name: '1UP' } };
const STAGES = [
  { name: 'JUNGLE PAVILION', floor: ['#2e6a38', '#2a6434', '#3a7a3c'] },
  { name: 'EXPO HALL C', floor: ['#4a3a78', '#443470', '#5a4888'] },
  { name: 'OVERFLOW PARKING', floor: ['#585864', '#50505c', '#6a6a78'] },
];
const BOSSES = ['BILLBOARD TRUCK', 'KEYNOTE TANK', 'BRAND AMBASSADOR'];
const TRUCK = [
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'rwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwr',
  'rwBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBwr',
  'rwBwwwBwwwBwBwwwBwwwBwBwwwBwBBwwwBwwwBwBwwwBwwwBBwwwBwBBwwBBBBwr',
  'rwBwBBBwBwBwBwBBBwBBBwBwBwBwBBwBBBwBwBwBwBBBwBwBBwBBBwBBwBBBBBwr',
  'rwBwwBBwwwBwBwBwBwwBBwBwwBBwBBwwBBwwwBwBwBwBwwBBBwwBBwBBwwBBBBwr',
  'rwBwBBBwBwBwBwBwBwBBBwBwBwBwBBwBBBwBwBwBwBwBwBwBBwBBBwBBwBBBBBwr',
  'rwBwwwBwBwBwBwwwBwwwBwBwBwBwwBwwwBwBwBwBwwwBwBwBBwwwBwwBwwBBBBwr',
  'rwBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBwr',
  'rwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwr',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  '................................................................',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggK',
  'KgkkkkgkkkkgkkkkgkkkkgkkkkggggrrggggkkkkgkkkkgkkkkgkkkkgkkkkggK',
  'KgkkkkgkkkkgkkkkgkkkkgkkkkgggrkkrgggkkkkgkkkkgkkkkgkkkkgkkkkggK',
  'KggggggggggggggggggggggggggggrkkrggggggggggggggggggggggggggggggK',
  'KggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'kkkkkkkk........................................kkkkkkkkkkkkkkkk',
  'kkkkkkkk........................................kkkkkkkkkkkkkkkk',
].map(r => r.padEnd(64, '.').slice(0, 64));
const TRUCK_S = spr(TRUCK);

export default {
  id: 'guerrilla', title: 'GUERRILLA MARKETING', genre: 'RUN AND GUN',
  blurb: 'One gorilla. Infinite bananas. Fight north through the sales floor and take out the brand.',
  controls: ['ARROWS MOVE AND AIM', 'Z BANANAS, X COCONUT'],
  create(a) {
    const fx = particles(a);
    const rows = new Map();
    let path = 7, lastRow = 15, stage = 0, nextBoss = -110, boss = null, lives = 3, coconuts = 3, inv = 90, deadT = 0, cd = 0, spread = 0, rapid = 0, banner = 120, plan = 0, planLeft = 0;
    let camY = 0, shots = [], ebul = [], nuts = [], foes = [], drops = [], droneT = 400, lockCam = false, bossRow = null, clearT = 0;
    const p = { x: 128, y: 200, ax: 0, ay: -1 };

    function makeRow(r) {
      if (r < nextBoss && bossRow === null) bossRow = r;
      const row = new Uint8Array(COLS);
      path = Math.max(2, Math.min(COLS - 3, path + a.rint(3) - 1));
      const freeish = c => Math.abs(c - path) <= 1;
      if (planLeft > 0) planLeft--; else { plan = a.pick([0, 0, 0, 1, 2, 3]); planLeft = plan === 2 ? 2 : plan === 1 ? 0 : 3 + a.rint(3); }
      if (r > -6 || bossRow !== null && r < bossRow + 1 && r > bossRow - 16) plan = 9;
      if (plan === 2) { for (let c = 0; c < COLS; c++) row[c] = freeish(c) ? BRIDGE : WATER; }
      else if (plan === 1) { for (let c = 0; c < COLS; c++) if (!freeish(c)) row[c] = a.chance(.5) ? BAGS : WALL; }
      else if (plan === 3) { for (let c = 0; c < COLS; c++) if (!freeish(c) && a.chance(.18)) row[c] = CRATE; }
      else if (plan === 0) for (let c = 0; c < COLS; c++) if (!freeish(c) && a.chance(.16)) row[c] = a.chance(.8) ? PALM : CRATE;
      if (plan !== 9 && plan !== 2) {
        const worldY = r * T + 8;
        if (a.chance(.2 + stage * .05)) {
          const c = a.rint(COLS);
          if (!row[c]) foes.push(newSuit(c * T + 8, worldY));
        }
        if (plan === 0 && a.chance(.05 + stage * .02)) {
          const c = a.pick([0, 1, 14, 15]);
          foes.push({ type: 'kiosk', x: c * T + 8, y: worldY, hp: 4, cd: 70 + a.rint(40), w: 16, h: 16 });
          row[c] = WALL;
        }
      }
      rows.set(r, row);
    }
    const newSuit = (x, y) => ({ type: 'suit', x, y, hp: 1, cd: 60 + a.rint(120), w: 10, h: 12, dx: 0, dy: 1, turn: 0 });
    function ensure() { const top = Math.floor((camY - 24) / T); while (lastRow > top) { lastRow--; makeRow(lastRow); } }
    for (let r = 15; r >= 0; r--) { const row = new Uint8Array(COLS); rows.set(r, row); if (r > 11) continue; for (let c = 0; c < COLS; c++) if ((c < 3 || c > 12) && a.chance(.3)) row[c] = PALM; }
    lastRow = 0; ensure();

    const tileAt = (x, y) => { if (x < 0 || x >= W) return WALL; const row = rows.get(Math.floor(y / T)); return row ? row[Math.floor(x / T)] : GROUND; };
    const walkOk = (x, y, hw, hh) => {
      for (const [px, py] of [[x - hw, y], [x + hw, y], [x - hw, y + hh], [x + hw, y + hh]]) if (walkBlock(tileAt(px, py))) return false;
      return true;
    };
    function breakTile(x, y) {
      const r = Math.floor(y / T), c = Math.floor(x / T), row = rows.get(r);
      if (!row || row[c] !== CRATE) return false;
      row[c] = GROUND;
      fx.burst(c * T + 8, r * T + 8, [C.n, C.Y], 12, 1.6, 22);
      a.add(50); a.sfx('crunch');
      if (a.chance(.55)) drops.push({ x: c * T + 8, y: r * T + 8, type: a.pick(['S', 'R', 'G', 'G', 'S', 'L']) });
      return true;
    }
    function fire() {
      const base = Math.atan2(p.ay, p.ax), angs = spread > 0 ? [-.22, 0, .22] : [0];
      for (const off of angs) shots.push({ x: p.x, y: p.y + 5, vx: Math.cos(base + off) * 4.4, vy: Math.sin(base + off) * 4.4, life: 46 });
      cd = rapid > 0 ? 6 : 11; a.sfx('shoot');
    }
    function enemyShot(x, y, ang, v = 1.8) { ebul.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v }); }
    const aim = (x, y) => Math.atan2(p.y + 6 - y, p.x - x);
    function killFoe(f, pts) {
      foes.splice(foes.indexOf(f), 1); a.add(pts);
      fx.pop(pts, f.x, f.y - 8, C.w, 24); fx.burst(f.x, f.y + 4, [C.K, C.t, C.r], 12, 1.6, 22); a.sfx('crunch');
    }
    function die() {
      lives--; deadT = 80; a.sfx('die'); a.shake(6); spread = 0; rapid = 0; ebul = [];
      fx.burst(p.x, p.y + 6, [C.K, C.r, C.t], 30, 2.2, 36, .02);
      if (lives <= 0) a.over(`FELL IN ${STAGES[stage % 3].name}`);
    }
    function blast(x, y) {
      a.sfx('boom'); a.shake(6); fx.burst(x, y, [C.y, C.o, C.r], 30, 2.4, 28, .02);
      for (const f of [...foes]) if (Math.hypot(f.x - x, f.y - y) < 34) { f.hp -= 4; if (f.hp <= 0) killFoe(f, 200); }
      if (boss && Math.hypot(boss.x - x, boss.y + 10 - y) < 52) { boss.hp -= 6; boss.flash = 6; }
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) breakTile(x + i * T, y + j * T);
    }
    function startBoss() {
      lockCam = true;
      boss = { x: 128, y: camY + 16, hp: 60 + stage * 36, max: 60 + stage * 36, cd: 80, dir: 1, flash: 0, summon: 200, name: BOSSES[stage % 3] };
      banner = 120;
      foes = [];
    }
    function bossKilled() {
      a.add(5000 + stage * 2500); a.shake(12); a.sfx('level');
      for (let i = 0; i < 8; i++) fx.burst(boss.x + (a.rand() - .5) * 60, boss.y + a.rand() * 18, [C.y, C.o, C.r, C.w], 18, 2.8, 40, .02);
      boss = null; clearT = 150; ebul = [];
    }

    return {
      update() {
        fx.update();
        if (banner) banner--;
        if (clearT && --clearT === 0) { stage++; banner = 120; lockCam = false; nextBoss = lastRow - 80 - stage * 8; bossRow = null; lives = Math.min(lives + 1, 5); coconuts = Math.min(coconuts + 2, 6); }
        if (spread) spread--;
        if (rapid) rapid--;
        if (inv) inv--;
        if (cd) cd--;

        if (deadT) { if (--deadT === 0 && lives > 0) inv = 150; }
        else {
          let vx = (a.held('right') ? 1 : 0) - (a.held('left') ? 1 : 0), vy = (a.held('down') ? 1 : 0) - (a.held('up') ? 1 : 0);
          if (vx || vy) {
            p.ax = vx; p.ay = vy;
            const s = 1.5 / Math.hypot(vx, vy);
            if (walkOk(p.x + vx * s, p.y, 5, 13)) p.x += vx * s;
            if (walkOk(p.x, p.y + vy * s, 5, 13)) p.y += vy * s;
          }
          p.x = Math.max(8, Math.min(W - 8, p.x));
          p.y = Math.min(camY + H - 18, Math.max(camY + (lockCam ? 96 : 12), p.y));
          if (a.held('a') && !cd) fire();
          if (a.hit('b') && coconuts > 0) { coconuts--; const m = Math.hypot(p.ax, p.ay); nuts.push({ x: p.x, y: p.y + 4, sx: p.x, sy: p.y + 4, tx: p.x + p.ax / m * 80, ty: p.y + p.ay / m * 80, t: 0, dur: 34 }); a.sfx('hit'); }
        }

        if (!lockCam && p.y - camY < 118) { camY = p.y - 118; ensure(); }
        if (!boss && !clearT && bossRow !== null && !lockCam && Math.floor(camY / T) <= bossRow - 12) startBoss();

        if (--droneT <= 0 && !boss) { droneT = Math.max(150, 420 - stage * 60) + a.rint(120); const left = a.chance(.5); foes.push({ type: 'drone', x: left ? -8 : W + 8, y: camY + 30 + a.rand() * 50, hp: 1, cd: 60, w: 9, h: 5, ph: 0, dir: left ? 1 : -1 }); }

        for (let i = foes.length - 1; i >= 0; i--) {
          const f = foes[i];
          if (f.y > camY + H + 24 || f.x < -30 || f.x > W + 30) { foes.splice(i, 1); continue; }
          const vis = f.y > camY - 8;
          if (f.type === 'suit') {
            if (!vis) continue;
            if (--f.turn <= 0) {
              f.turn = 40 + a.rint(50);
              const ang = aim(f.x, f.y) + (a.rand() - .5) * 1.1;
              f.dx = Math.cos(ang); f.dy = Math.sin(ang);
            }
            const sp = .55 + stage * .06;
            if (walkOk(f.x + f.dx * sp, f.y, 4, 11)) f.x += f.dx * sp; else f.turn = 0;
            if (walkOk(f.x, f.y + f.dy * sp, 4, 11)) f.y += f.dy * sp; else f.turn = 0;
            if (--f.cd <= 0) { f.cd = 80 + a.rint(90) - stage * 8; if (!deadT) enemyShot(f.x, f.y + 4, aim(f.x, f.y), 1.7 + stage * .12); }
          } else if (f.type === 'kiosk') {
            if (!vis) continue;
            if (--f.cd <= 0) { f.cd = 110 - stage * 8; const b = aim(f.x, f.y); for (const off of [-.3, 0, .3]) enemyShot(f.x, f.y, b + off, 1.6); }
          } else {
            f.ph += .05; f.x += f.dir * .9; f.y += Math.sin(f.ph) * .6 + .1;
            if (--f.cd <= 0) { f.cd = 90; if (!deadT) enemyShot(f.x, f.y, aim(f.x, f.y), 2); }
          }
          if (!deadT && !inv && f.type !== 'kiosk' && Math.abs(f.x - p.x) < 9 && Math.abs(f.y + 5 - (p.y + 7)) < 11) die();
        }

        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i]; s.x += s.vx; s.y += s.vy;
          if (--s.life <= 0 || s.x < 0 || s.x > W || s.y < camY + 8 || s.y > camY + H) { shots.splice(i, 1); continue; }
          const t = tileAt(s.x, s.y);
          if (shotBlock(t)) { if (t === CRATE) { const r = Math.floor(s.y / T), c = Math.floor(s.x / T); const key = rows.get(r); key.hits = key.hits || {}; key.hits[c] = (key.hits[c] || 0) + 1; if (key.hits[c] >= 2) breakTile(s.x, s.y); else fx.burst(s.x, s.y, C.Y, 3, 1, 10); } shots.splice(i, 1); continue; }
          const f = foes.find(q => Math.abs(q.x - s.x) < q.w / 2 + 2 && s.y > q.y - 3 && s.y < q.y + q.h + 2);
          if (f) { shots.splice(i, 1); if (--f.hp <= 0) killFoe(f, f.type === 'kiosk' ? 500 : f.type === 'drone' ? 200 : 100); else { a.sfx('hit'); fx.burst(s.x, s.y, C.w, 3, 1, 10); } continue; }
          if (boss && Math.abs(s.x - boss.x) < 32 && s.y > boss.y && s.y < boss.y + 21) { shots.splice(i, 1); boss.hp--; boss.flash = 3; a.add(10); if (boss.hp <= 0) bossKilled(); }
        }
        for (let i = ebul.length - 1; i >= 0; i--) {
          const b = ebul[i]; b.x += b.vx; b.y += b.vy;
          if (b.x < 0 || b.x > W || b.y < camY || b.y > camY + H || shotBlock(tileAt(b.x, b.y))) { ebul.splice(i, 1); continue; }
          if (!deadT && !inv && Math.abs(b.x - p.x) < 6 && b.y > p.y && b.y < p.y + 15) { die(); break; }
        }
        for (let i = nuts.length - 1; i >= 0; i--) {
          const n = nuts[i], k = ++n.t / n.dur;
          n.x = n.sx + (n.tx - n.sx) * k; n.y = n.sy + (n.ty - n.sy) * k; n.h = Math.sin(k * Math.PI) * 26;
          if (k >= 1) { nuts.splice(i, 1); blast(n.x, n.y); if (boss && boss.hp <= 0) bossKilled(); }
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          if (d.y > camY + H + 10) { drops.splice(i, 1); continue; }
          if (Math.abs(d.x - p.x) < 11 && Math.abs(d.y - (p.y + 7)) < 12) {
            drops.splice(i, 1); fx.pop(PICK[d.type].name, p.x, p.y - 8, PICK[d.type].col, 40); a.sfx('pick');
            if (d.type === 'S') spread = 700; else if (d.type === 'R') rapid = 700; else if (d.type === 'G') coconuts = Math.min(coconuts + 3, 9); else lives = Math.min(lives + 1, 5);
          }
        }
        if (boss) {
          boss.x += boss.dir * (.8 + stage * .12);
          if (boss.x > W - 36 || boss.x < 36) boss.dir = -boss.dir;
          if (boss.flash) boss.flash--;
          if (--boss.cd <= 0) {
            boss.cd = Math.max(46, 92 - stage * 10);
            const b = aim(boss.x, boss.y + 20), n = 2 + Math.min(stage, 2);
            for (let i = -n; i <= n; i++) enemyShot(boss.x, boss.y + 20, b + i * .2, 1.7 + stage * .1);
          }
          if (--boss.summon <= 0) { boss.summon = 240; if (foes.length < 5) foes.push(newSuit(a.chance(.5) ? 20 : W - 20, camY + 40)); }
          if (boss.hp <= 0) bossKilled();
        }
        for (const r of rows.keys()) if (r * T > camY + H + 64) rows.delete(r);
      },
      draw(g) {
        const st = STAGES[stage % 3], ox = 0, oy = camY;
        g.clear(st.floor[0]);
        const first = Math.floor(camY / T), last = first + 16;
        for (let r = first; r <= last; r++) {
          const row = rows.get(r);
          if (!row) continue;
          for (let c = 0; c < COLS; c++) {
            const x = c * T, y = r * T - oy, t = row[c], n = (c * 31 + (r & 255) * 17) % 13;
            g.rect(x, y, T, T, (c + r) & 1 ? st.floor[0] : st.floor[1]);
            if (n === 4) g.rect(x + 3, y + 9, 3, 1, st.floor[2]);
            if (n === 8) g.rect(x + 10, y + 4, 2, 2, st.floor[2]);
            if (t === WATER) {
              g.rect(x, y, T, T, C.b);
              const w = ((a.t >> 4) + c + r) & 3;
              g.rect(x + 2 + w * 3, y + 5, 5, 1, C.c); g.rect(x + 8 - w, y + 11, 4, 1, C.s);
            } else if (t === BRIDGE) {
              g.rect(x, y, T, T, C.n);
              for (let k = 2; k < T; k += 4) g.rect(x, y + k, T, 1, C.N);
            } else if (TILES[t]) g.spr(TILES[t], x, y);
          }
        }
        for (const d of drops) { g.rect(d.x - 5, d.y - oy - 5, 11, 11, PICK[d.type].col); g.box(d.x - 5, d.y - oy - 5, 11, 11, C.w); g.text(d.type, d.x - 2, d.y - oy - 4, C.k); }
        const fr = (a.t >> 4) & 1;
        for (const f of foes) {
          if (f.type === 'suit') g.spr(SUIT[fr], f.x - 5, f.y - oy);
          else if (f.type === 'kiosk') g.spr(KIOSK, f.x - 8, f.y - oy - 8);
          else g.spr(DRONE[(a.t >> 2) & 1], f.x - 4, f.y - oy);
        }
        if (boss && !(boss.flash & 2)) g.spr(TRUCK_S, boss.x - 32, boss.y - oy);
        for (const n of nuts) g.spr(COCO, n.x - 2, n.y - oy - n.h);
        if (!deadT && !(inv & 4)) g.spr(APE[((p.x + p.y) >> 3) & 1], p.x - 7, p.y - oy);
        for (const s of shots) g.spr(BANANA, s.x - 2, s.y - oy - 2);
        for (const b of ebul) { g.rect(b.x - 1, b.y - oy - 1, 3, 3, C.r); g.rect(b.x, b.y - oy, 1, 1, C.w); }
        fx.draw(g, ox, oy);

        for (let i = 0; i < lives; i++) { g.rect(4 + i * 8, 12, 6, 6, C.K); g.rect(5 + i * 8, 13, 4, 3, C.t); }
        for (let i = 0; i < coconuts; i++) g.spr(COCO, W - 8 - i * 7, 13);
        if (boss) {
          g.rect(40, 12, 176, 10, C.k); g.rect(42, 14, 172 * Math.max(boss.hp, 0) / boss.max, 6, C.r);
          g.center(boss.name, 24, C.y);
        }
        if (banner > 0 && !boss && !clearT) g.center(st.name, 110, C.y);
        if (banner > 40 && boss) g.center('MARKET LEADER AHEAD', 100, C.r);
        if (clearT) g.center('MARKET DISRUPTED', 104, C.y, 2);
      },
      bot() {
        if (deadT) return {};
        const out = { a: !a.held('a') || cd === 0 };
        if (boss) {
          const dx = boss.x - p.x;
          out.up = true;
          const near = ebul.find(b => b.y > p.y - 40 && Math.abs(b.x - p.x) < 12);
          if (near) { out[near.x > p.x ? 'left' : 'right'] = true; } else if (Math.abs(dx) > 8) out[dx > 0 ? 'right' : 'left'] = true;
          return out;
        }
        out.up = true;
        const r = Math.floor((p.y - 4) / T);
        let tc = 8, gap = 99;
        for (let k = 1; k <= 3; k++) {
          const row = rows.get(r - k);
          if (!row) break;
          for (let c = 1; c < COLS - 1; c++) {
            if (!walkBlock(row[c]) && !walkBlock(row[c - 1]) && !walkBlock(row[c + 1])) {
              const d = Math.abs(c * T + 8 - p.x);
              if (d < gap) { gap = d; tc = c; }
            }
          }
          if (gap < 99) break;
        }
        const tx = tc * T + 8;
        if (Math.abs(tx - p.x) > 3) out[tx > p.x ? 'right' : 'left'] = true;
        const f = foes.filter(q => q.y < p.y && q.y > camY).sort((m, n) => n.y - m.y)[0];
        if (f && Math.abs(f.x - p.x) > 4 && Math.abs(tx - p.x) <= 3) out[f.x > p.x ? 'right' : 'left'] = true;
        if (coconuts && boss && a.t % 240 === 0) out.b = true;
        return out;
      },
      state: () => ({ stage, lives, camY, foes: foes.length, boss: boss?.hp ?? null }),
    };
  },
};
