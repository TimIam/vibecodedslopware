// Level 5, the City Wall: the outskirts under a great round city. The wall runs along the top of the world with a moat
// below it; the drawbridge is up. Nothing says so, but the way in is to knock the outlying houses down, shove the
// rubble (and the old bridge's timbers) into the moat until there is a crossing wide enough to walk, then batter a wall
// section or the gate until it gives (about 20 hits), and walk into the breach: the boss walks on north and off the
// screen (api.walkOff) and the level is over. Wrecking houses feeds Vengeance. No laps, no Chaos.
//
// The wall is drawn as if the city were a drum turning past as the camera scrolls: every screen column looks up the
// wall texture through a cylindrical projection (squeezed and shaded toward the screen edges, the base curving up),
// with the city's rooftops on a smaller drum behind it for parallax. The hitboxes are plain world rectangles along the
// wall line; the projection is near 1:1 at the middle of the screen, which is where the boss is.

import { scatter } from './forest.js';
import { isWater } from '../props.js';

const TAU = Math.PI * 2;
const WW = 1280, WH = 180;
const MOAT0 = 42, MOAT1 = 72;          // the moat's rows (world y): open water from the wall foot to the outer bank
const WALL_B = 42;                     // the wall's hitboxes run from y 0 to here
const BASH = 45;                       // one bash (props.js bossTouch default); wall pieces take this many to break
const HITS = { wl_curtain: 20, wl_tower: 24, wl_gate: 18 };
const LABEL = { wl_curtain: 'WALL', wl_tower: 'TOWER', wl_gate: 'GATE' };
const GATE_X0 = 848, GATE_X1 = 874;    // the gate passage, flanked by its two towers
const OLD_X = 300;                     // where the old bridge fell in (a bricked-up postern above it)

// the projection: wall drum radius, how far its base lifts at the screen edge, and the rooftops' drum behind it
const R = 200, CURVE = 26, R2 = 168, CURVE2 = 12;
const TEXOFF = 40, TEXW = WW + TEXOFF * 2, TH = 48, RH = 24;

// ---------------------------------------------------------------------------------------------- kinds

const WALLK = { solid: true, breaks: true, value: { pts: 0, venge: 0, chaos: 0 } };
export const kinds = {
  wl_curtain: { ...WALLK, w: 40, h: WALL_B, hp: HITS.wl_curtain * BASH },
  wl_tower: { ...WALLK, w: 24, h: WALL_B, hp: HITS.wl_tower * BASH },
  wl_gate: { ...WALLK, w: 26, h: WALL_B, hp: HITS.wl_gate * BASH },
  // outlying buildings: solid, bashed down, they leave rubble you can shove
  wl_cottage: { w: 18, h: 12, hp: 135, solid: true, flammable: true, burnTime: 8, spread: 0.25, crushShare: 0.5, rubble: 'wl_timber', rubbleN: 2, value: { pts: 320, venge: 0.3 } },
  wl_house: { w: 20, h: 14, hp: 270, solid: true, rubble: 'wl_stones', rubbleN: 3, value: { pts: 480, venge: 0.42 } },
  wl_barn: { w: 28, h: 16, hp: 225, solid: true, flammable: true, burnTime: 10, spread: 0.3, crushShare: 0.5, rubble: 'wl_timber', rubbleN: 3, value: { pts: 520, venge: 0.45 } },
  wl_watch: { r: 7, hp: 360, solid: true, rubble: 'wl_block', rubbleN: 3, value: { pts: 650, venge: 0.55 } },
  wl_cart: { r: 4, hp: 1, flammable: true, burnTime: 4, rubble: 'wl_timber', rubbleN: 1, value: { pts: 60, venge: 0.06 } },
  wl_stall: { w: 12, h: 8, hp: 1, flammable: true, burnTime: 4, rubble: 'wl_timber', rubbleN: 1, value: { pts: 90, venge: 0.08 } },
  // rubble lies down, ready to shove; it fills the moat cells it slides into
  wl_stones: { r: 3, push: true, fill: 1 },
  wl_timber: { r: 3, push: true, fill: 1 },
  wl_block: { r: 3.5, push: true, fill: 2 },
};

// ---------------------------------------------------------------------------------------------- the map

// the wall, left to right: towers, curtain runs between them, and the gatehouse. x0/x1 in world px (it runs a little
// past both ends of the world so the drum has something to show there)
function layoutWall() {
  const anchors = [[-16, 8, 'wl_tower'], [158, 182, 'wl_tower'], [408, 432, 'wl_tower'], [618, 642, 'wl_tower'],
    [826, GATE_X0, 'wl_tower', 'L'], [GATE_X0, GATE_X1, 'wl_gate'], [GATE_X1, 896, 'wl_tower', 'R'],
    [1068, 1092, 'wl_tower'], [1258, 1282, 'wl_tower']];
  const secs = [];
  let x = -TEXOFF;
  for (const [a0, a1, kind, side] of [...anchors, [WW + TEXOFF, WW + TEXOFF, null]]) {
    const gap = a0 - x;
    if (gap > 0) {
      const n = Math.max(1, Math.round(gap / 40));
      for (let i = 0; i < n; i++) {
        const s0 = Math.round(x + gap * i / n), s1 = Math.round(x + gap * (i + 1) / n);
        secs.push({ kind: 'wl_curtain', x0: s0, x1: s1, postern: OLD_X >= s0 && OLD_X < s1 });
      }
    }
    if (kind) secs.push({ kind, x0: a0, x1: a1, banner: !!side });
    x = a1;
  }
  secs.forEach((s, i) => { s.i = i; s.total = HITS[s.kind]; s.label = LABEL[s.kind]; s.drawn = -1; });
  return secs;
}

function build(g, rng, P) {
  const start = { x: 70, y: 122, face: 0 };
  const water = P.makeWater(WW, WH, 6), cs = water.cs;
  P.setWater(water, 0, MOAT0, WW - 1, MOAT1 - 1, 1);
  const fill = (c, r) => { if (c >= 0 && c < water.cols) water.a[r * water.cols + c] = 2; };
  const r0 = MOAT0 / cs, r1 = MOAT1 / cs - 1;   // rows 7..11
  // the old bridge: what is left of its spans, never more than two cells wide
  const oc = Math.floor(OLD_X / cs);
  [[oc], [oc], [oc - 1, oc], [oc], [oc - 1, oc, oc + 1]].forEach((cols, k) => cols.forEach(c => fill(c, r0 + k)));
  // the drawbridge's outer landing
  for (let c = Math.floor(GATE_X0 / cs) + 1; c <= Math.floor(GATE_X1 / cs) - 1; c++) fill(c, r1);
  // silt and old spoil along the outer bank, a cell here and there
  for (let i = 0; i < 26; i++) {
    const c = Math.floor(rng() * water.cols), r = rng() < 0.75 ? r1 : r1 - 1;
    if (Math.abs(c * cs - OLD_X) < 30 || Math.abs(c * cs - (GATE_X0 + GATE_X1) / 2) < 30) continue;
    // never two side by side, so nowhere starts out crossable
    const row = r * water.cols;
    if (water.a[row + c - 1] === 2 || water.a[row + c + 1] === 2 || water.a[row + c - 2] === 2 || water.a[row + c + 2] === 2) continue;
    fill(c, r);
  }
  g.water = water; g.waterDirty = true;

  // the wall itself: one solid prop per piece, along the wall line in plain world coordinates
  const wall = layoutWall();
  for (const s of wall) {
    const a = Math.max(0, s.x0), b = Math.min(WW, s.x1);
    if (b - a < 2) continue;
    const hp = kinds[s.kind].hp;
    s.prop = P.addProp(g, s.kind, (a + b) / 2, WALL_B / 2, { w: b - a, h: WALL_B, lastHp: hp, sec: s.i });
  }

  // the outskirts: a road along the bottom, a lane up to the gate, houses, barns and towers either side
  const roadY = x => 132 + Math.sin(x / 110) * 9 + Math.sin(x / 37) * 3;
  const keep = [{ x: start.x, y: start.y, r: 34 }];
  for (let y = 70; y < 140; y += 8) keep.push({ x: gateLaneX(y), y, r: 18 });
  keep.push({ x: OLD_X, y: 88, r: 20 }, { x: 600, y: 94, r: 22 });
  const spots = scatter(rng, 34, 24, 92, WW - 24, 152, 31, keep).filter(s => Math.abs(s.y - roadY(s.x)) > 13);
  for (const s of spots) {
    const k = rng(), kind = k < 0.36 ? 'wl_cottage' : k < 0.68 ? 'wl_house' : k < 0.84 ? 'wl_barn' : 'wl_watch';
    P.addProp(g, kind, Math.round(s.x), Math.round(s.y));
  }
  // carts and market stalls along the road and up the lane
  for (let i = 0; i < 9; i++) {
    const x = 120 + rng() * (WW - 200), y = roadY(x) + (rng() < 0.5 ? -9 : 9);
    if (Math.hypot(x - start.x, y - start.y) < 30) continue;
    P.addProp(g, rng() < 0.5 ? 'wl_cart' : 'wl_stall', Math.round(x), Math.round(y));
  }
  for (const y of [96, 112]) P.addProp(g, 'wl_stall', Math.round(gateLaneX(y) + (y === 96 ? -16 : 17)), y);
  // the old bridge's timbers on the bank, and a mason's yard of cut blocks
  for (const [dx, dy] of [[-22, 96], [14, 104], [30, 90]]) P.addProp(g, 'wl_timber', OLD_X + dx, dy);
  for (const [dx, dy] of [[-12, 88], [0, 86], [12, 90], [-6, 98], [8, 100]]) P.addProp(g, 'wl_block', 600 + dx, dy);

  return { w: WW, h: WH, scroll: 'x', start, wall, edges: [0, 1, 3], sideBand: [86, 140], key: Math.floor(rng() * 1e9), roadY };
}
const gateLaneX = y => (GATE_X0 + GATE_X1) / 2 + Math.sin(y / 15) * 3;

// ---------------------------------------------------------------------------------------------- the level's rules

function update(g, dt, api) {
  const m = g.map, b = g.boss;
  // only someone standing on a crossing can hurt the wall: hits from the far bank glance off
  const across = b.y < MOAT1 + 3;
  for (const s of m.wall) {
    const p = s.prop;
    if (!p) continue;
    if (p.state === 'up') {
      if (p.hp < p.lastHp) {
        if (across) {
          p.lastHp = p.hp; s.hit = true;
          for (let i = 0; i < 4; i++) api.part(g, Math.max(p.x - p.w / 2, Math.min(p.x + p.w / 2, b.x)) + (g.rng() - 0.5) * 14, WALL_B - 2 - g.rng() * 8, (g.rng() - 0.5) * 30, 10 + g.rng() * 20, 0.6, 'dust');
        } else {
          p.hp = p.lastHp;
          if (g.rng() < 0.3) api.part(g, p.x + (g.rng() - 0.5) * p.w, WALL_B - 4, (g.rng() - 0.5) * 20, 15, 0.3, 'spark');
        }
      }
    } else if (!s.breached && !g.clear && !g.won) {
      // through: the breach coughs dust and stands open. Walking into it ends the level.
      s.breached = true;
      g.shake = Math.max(g.shake, 0.7);
      for (let i = 0; i < 40; i++) { const a = g.rng() * Math.PI, sp = 20 + g.rng() * 50; api.part(g, p.x + (g.rng() - 0.5) * p.w, WALL_B - g.rng() * 20, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, 0.6 + g.rng() * 0.8, g.rng() < 0.6 ? 'dust' : 'rock2'); }
      const pts = Math.round(3000 * g.mult);
      api.addScore(g, pts);
      api.text(g, p.x, WALL_B + 14, `+${pts}`, 'gold', 2);
      api.sound(g, 'collapse');
      api.banner(g, s.kind === 'wl_gate' ? 'THE GATE IS DOWN' : 'THE WALL IS DOWN', 'THE CITY IS OPEN. WALK IN.', 4);
    }
  }
  // into a breach: the boss walks on through, north and out of sight, and the level is over
  if (!g.clear && !g.won && !b.dead) {
    for (const s of m.wall) {
      if (!s.breached) continue;
      const a = Math.max(0, s.x0), c = Math.min(WW, s.x1);
      if (b.y < WALL_B + 6 && b.x > a - 2 && b.x < c + 2) {
        api.walkOff(g, { x: (a + c) / 2, title: 'INTO THE CITY', sub: 'THE HOARD OPENS IN A MOMENT.' });
        break;
      }
    }
  }
  // rubble shoved up a crossing stops at the wall foot. Rubble that comes to rest on a heap in the moat tumbles off it
  // into the nearest open water, so nothing is ever stranded out of reach on a causeway too narrow to walk.
  const cs = g.water.cs;
  for (const p of g.props) {
    if (p.state !== 'down' || !kinds[p.kind]?.push) continue;
    if (p.y < MOAT0 + 3) { p.y = MOAT0 + 3; p.vy = Math.max(0, p.vy); }
    if (p.vx || p.vy || p.y >= MOAT1 || isWater(g, p.x, p.y)) continue;
    for (const [dx, dy] of TUMBLE) {
      const tx = p.x + dx * cs, ty = p.y + dy * cs;
      if (!isWater(g, tx, ty)) continue;
      const l = Math.hypot(dx, dy);
      p.vx = dx / l * 38 * l; p.vy = dy / l * 38 * l;
      g.propsDirty = true;
      break;
    }
  }
  for (const u of g.units) if (!u.dead && u.y < MOAT0 && !(u.role === 'rider' && u.state === 'climb')) u.y = MOAT1 + 4;
}

const TUMBLE = [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1], [0, 1], [-1, 1], [1, 1], [0, -2], [-2, 0], [2, 0], [-2, -1], [2, -1], [-1, -2], [1, -2]];

const FLAVOUR = ['THE GATES ARE SHUT', 'THE CITY HOLDS ITS BREATH', 'THEY ARE WATCHING FROM THE WALL', 'THE MOAT IS DEEP AND COLD'];
function hud(g) {
  if (g.walkoff) return 'INTO THE CITY';
  if (g.map.wall.some(s => s.breached)) return 'THE WAY IS OPEN. WALK IN';
  let best = null;
  for (const s of g.map.wall) {
    const p = s.prop;
    if (!p || p.state !== 'up') continue;
    const hits = Math.round((p.maxhp - p.hp) / BASH);
    if (hits > 0 && (!best || hits / s.total > best.k)) best = { s, hits, k: hits / s.total };
  }
  if (best) return `${best.s.label} ${Math.min(best.hits, best.s.total - 1)}/${best.s.total}`;
  return FLAVOUR[Math.floor((g.t - (g.levelT0 || 0)) / 9) % FLAVOUR.length];
}

// ---------------------------------------------------------------------------------------------- art: palettes

const INK = '#14100c';
const ST = ['#2b2924', '#423e35', '#555046', '#6a6455', '#827b67', '#9a927b', '#b3aa90'];   // wall limestone, dark to lit
const MOSS = ['#2f3c20', '#3e4e28', '#4f6230'];
const WOOD = ['#3a2416', '#553620', '#6e4a2a', '#866034'];
const IRON = ['#1e1e22', '#3a3a40', '#62626a'];
const pick = (arr, l) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(l)))];

function dot(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }

// ---------------------------------------------------------------------------------------------- art: the wall texture

// one stone of a coursed ashlar face: tone from a per-stone hash, a lit top edge and left edge, dark joints
function ashlar(h, X, y, y0, base, seed) {
  const course = Math.floor((y - y0) / 4), row = (y - y0) % 4;
  if (row === 3) return 1;                              // bed joint
  const L = 6 + (course * 5 + seed) % 4, off = course * 3 + seed;
  const k = ((X + off) % L + L) % L, id = Math.floor((X + off) / L);
  if (k === 0) return 1;                                // head joint
  let l = base + (h.hash(id * 7 + seed, course) - 0.5) * 1.6 + (h.hash(X, y * 3 + seed) - 0.5) * 0.7;
  if (row === 0) l += 0.8;                              // top edge catches the light
  if (k === 1) l += 0.5;                                // and the left edge
  if (k === L - 1) l -= 0.4;
  return l;
}

function paintCurtain(c, s, stage, h) {
  const sd = s.i * 13 + 5;
  for (let X = s.x0; X < s.x1; X++) {
    const tx = X + TEXOFF, m7 = ((X % 7) + 7) % 7, merlon = m7 < 5;
    for (let y = 10; y < 46; y++) {
      let col = null;
      if (y === 10) col = ST[1];                                      // the inner edge of the wall walk
      else if (y === 11) col = ST[3];
      else if (y <= 14) col = (X + y * 3) % 9 === 0 ? ST[3] : y === 14 ? ST[3] : ST[5];   // flagstones
      else if (y <= 21) {
        if (merlon) {
          if (y === 15) col = ST[6];
          else if (y === 16) col = ST[5];
          else col = pick(ST, (m7 === 0 ? 4.4 : m7 === 4 ? 2.4 : 3.4) - (y - 17) * 0.15 + (h.hash(X, y) - 0.5) * 0.6);
          if (m7 === 4 && y > 15) col = ST[1];                           // shadow side of the merlon
        } else col = y <= 17 ? ST[2] : y <= 19 ? ST[0] : ST[5];           // looking through the crenel to the walk
        if (!merlon && y === 20) col = ST[5];
        if (!merlon && y === 21) col = ST[4];
      } else if (y === 22) col = ST[6];                                  // string course
      else if (y === 23) col = '#24211c';
      else if (y <= 41) {
        const l = ashlar(h, X, y, 24, 3.1 - (y - 24) * 0.06, sd);
        col = l === 1 ? ST[1] : pick(ST, l);
        // grime and moss toward the water
        if (y > 34 && h.hash(X * 3, y + sd) < (y - 34) * 0.07) col = h.hash(X, y * 7) < 0.5 ? MOSS[1] : MOSS[0];
        if (y > 38 && (X + sd) % 23 < 2 && h.hash(X, y) < 0.7) col = '#2c2e28';   // drain stains
      } else if (y <= 44) {
        col = h.hash(X * 5, y) < 0.3 ? MOSS[0] : y === 44 ? '#1d2a2e' : pick(ST, 1.6 + h.hash(X, y + 1) * 1.4);
        if (y === 42 && h.hash(X, 99) < 0.4) col = MOSS[2];
      }
      if (col) dot(c, tx, y, col);
    }
    // arrow slits
    const lx = X - s.x0;
    if (lx === Math.floor((s.x1 - s.x0) / 2) && !s.postern) for (let y = 27; y < 33; y++) { dot(c, tx, y, INK); dot(c, tx - 1, y, ST[2]); dot(c, tx + 1, y, ST[5]); }
  }
  if (s.postern) {
    // the old postern the bridge led to, bricked up long ago
    const cx = OLD_X;
    for (let y = 26; y < 42; y++) for (let dx = -6; dx <= 6; dx++) {
      const top = 32 - Math.sqrt(Math.max(0, 36 - dx * dx));
      if (y < top - 1) continue;
      const ring = y < top + 1 || Math.abs(dx) === 6;
      const brick = ((dx + 8 + (Math.floor(y / 2) % 2) * 2) % 4 === 0) || y % 2 === 0;
      dot(c, cx + dx + TEXOFF, y, ring ? (dx < 0 ? ST[6] : ST[4]) : brick ? '#4a4038' : pick(['#5e5348', '#6a5c4e', '#544a40'], h.hash(dx, y) * 2.9 - 0.5));
    }
  }
  if (stage > 0) damage(c, s, stage, h, 24, 41);
}

// cracks, knocked-off merlons and holes, drawn over a section in proportion to how hurt it is
function damage(c, s, stage, h, y0, y1) {
  const sd = s.i * 31 + 7, w = s.x1 - s.x0;
  for (let k = 0; k < stage * 2; k++) {
    let x = s.x0 + 3 + Math.floor(h.hash(sd + k, 1) * (w - 6)), y = y0 - 2 + Math.floor(h.hash(sd, k + 3) * 4);
    const len = 8 + Math.floor(h.hash(k, sd) * 10) + stage * 3;
    for (let i = 0; i < len && y < y1; i++) {
      dot(c, x + TEXOFF, y, i % 5 === 4 ? ST[1] : '#16130f'); if (h.hash(x, y + sd) < 0.3) dot(c, x + 1 + TEXOFF, y, ST[4]);
      if (h.hash(i, sd + k) < 0.12) { const bx = x + (h.hash(y, k) < 0.5 ? -1 : 1); dot(c, bx + TEXOFF, y + 1, '#24201a'); dot(c, bx * 2 - x + TEXOFF, y + 2, '#24201a'); }
      y++; { const t = h.hash(x * 3 + i, y + sd); x += t < 0.28 ? -1 : t > 0.72 ? 1 : 0; }
      x = Math.max(s.x0 + 1, Math.min(s.x1 - 2, x));
    }
  }
  if (stage >= 2 && s.kind !== 'wl_gate') {
    // a merlon or two knocked off the parapet, fresh pale scars
    for (let k = 0; k < stage - 1; k++) {
      const mx = s.x0 + 2 + Math.floor(h.hash(sd, 40 + k) * (w - 8));
      for (let x = mx; x < mx + 5; x++) for (let y = s.kind === 'wl_tower' ? 2 : 15; y < (s.kind === 'wl_tower' ? 7 : 21); y++) {
        const t = h.hash(x, y + sd);
        c.clearRect(x + TEXOFF, y, 1, 1);
        if (y > (s.kind === 'wl_tower' ? 4 : 18) || t < 0.25) dot(c, x + TEXOFF, y, t < 0.5 ? ST[2] : ST[6]);
      }
    }
  }
  if (stage >= 3) {
    // a hole in the face showing the rubble core
    const hx = Math.floor((s.x0 + s.x1) / 2) + Math.floor((h.hash(sd, 9) - 0.5) * (w - 14)), hy = y0 + 7;
    for (let y = hy - 5; y <= hy + 5; y++) for (let x = hx - 6; x <= hx + 6; x++) {
      const d = Math.hypot((x - hx) / 6, (y - hy) / 5) + (h.hash(x, y) - 0.5) * 0.35;
      if (d > 1) continue;
      dot(c, x + TEXOFF, y, d > 0.8 ? ST[6] : d > 0.6 ? ST[1] : h.hash(x * 3, y) < 0.3 ? ST[2] : '#1a1712');
    }
    for (let i = 0; i < 9; i++) { const x = s.x0 + Math.floor(h.hash(i, sd) * w); dot(c, x + TEXOFF, 42, ST[4]); dot(c, x + TEXOFF + 1, 42, ST[2]); dot(c, x + TEXOFF, 41, ST[5]); }
  }
}

function paintTower(c, s, stage, h) {
  const tw = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, sd = s.i * 17 + 3;
  for (let X = s.x0; X < s.x1; X++) {
    const tx = X + TEXOFF, nx = (X + 0.5 - cx) / (tw / 2), a = Math.asin(Math.max(-1, Math.min(1, nx)));
    const lit = 3.3 - nx * 1.6 - nx * nx * 1.1;
    const edge = X === s.x0 || X === s.x1 - 1;
    const merl = Math.floor((a + 2) * 3.2) % 2 === 0;
    for (let y = 1; y < 46; y++) {
      let col = null;
      if (y <= 7) {
        // the parapet ring round the top
        if (merl) col = y === 1 ? (edge ? null : ST[6]) : y === 2 ? ST[5] : pick(ST, lit + 0.3 - (y - 3) * 0.1);
        else col = y <= 3 ? null : y === 4 ? ST[1] : y === 5 ? ST[5] : pick(ST, lit + 0.2);
      } else if (y <= 9) col = (X + y) % 2 ? INK : pick(ST, lit + 0.8);            // machicolations
      else if (y === 10) col = '#1e1b17';
      else if (y <= 43) {
        // coursed stone wrapped round the drum: head joints closer together toward the sides
        const course = Math.floor((y - 11) / 4), row = (y - 11) % 4;
        const sid = Math.floor(a * 3.2 + course * 0.5 + sd), sidL = Math.floor(Math.asin(Math.max(-1, Math.min(1, nx - 2 / tw))) * 3.2 + course * 0.5 + sd);
        if (row === 3 || sid !== sidL) col = pick(ST, lit - 1.6);
        else col = pick(ST, lit + (row === 0 ? 0.6 : 0) + (h.hash(sid, course) - 0.5) * 1.2 + (h.hash(X, y + sd) - 0.5) * 0.5);
        if (y > 35 && h.hash(X * 3, y + sd) < (y - 35) * 0.08) col = MOSS[h.hash(X, y) < 0.5 ? 1 : 0];
        if (y >= 42) col = y === 43 ? '#1d2a2e' : h.hash(X, y) < 0.35 ? MOSS[0] : pick(ST, lit - 1.2);
      }
      if (edge && y > 2 && y < 43) col = INK;
      if (col) dot(c, tx, y, col);
    }
  }
  // the dark inside of the tower top, between the merlons
  for (let X = s.x0 + 2; X < s.x1 - 2; X++) dot(c, X + TEXOFF, 3, '#24201b');
  // arrow slits, and a banner on the gatehouse towers
  const sx = Math.round(cx - 0.5) + TEXOFF;
  for (let y = 15; y < 21; y++) { dot(c, sx, y, INK); dot(c, sx + 1, y, ST[5]); }
  for (let y = 28; y < 33; y++) { dot(c, sx - 5, y, INK); dot(c, sx + 5, y, INK); dot(c, sx + 6, y, ST[4]); }
  if (s.banner) {
    for (let y = 11; y < 26; y++) for (let dx = -3; dx <= 3; dx++) {
      if (y > 23 && Math.abs(dx) < 25 - y) continue;   // swallowtail
      const ed = Math.abs(dx) === 3 || y === 11;
      dot(c, sx + dx, y, ed ? '#4a140f' : dx < 0 ? '#a8362a' : '#8a2a20');
    }
    for (const [dx, dy] of [[0, 15], [-1, 16], [0, 16], [1, 16], [0, 17], [-1, 18], [1, 18], [0, 19]]) dot(c, sx + dx, dy, '#e8c050');
    dot(c, sx - 4, 11, IRON[2]); dot(c, sx + 4, 11, IRON[2]);
  }
  if (stage > 0) damage(c, s, stage, h, 12, 41);
}

function paintGate(c, s, stage, h) {
  const cx = (s.x0 + s.x1) / 2, sd = s.i * 11;
  for (let X = s.x0; X < s.x1; X++) {
    const tx = X + TEXOFF, dx = X + 0.5 - cx, m6 = ((X - s.x0) % 6 + 6) % 6, merlon = m6 < 4;
    for (let y = 8; y < 46; y++) {
      let col = null;
      const archTop = 30 - Math.sqrt(Math.max(0, 81 - dx * dx)), inArch = Math.abs(dx) < 9 && y >= archTop;
      if (y <= 9) col = y === 8 ? ST[1] : ST[5];
      else if (y <= 15) {
        if (merlon) col = y === 10 ? ST[6] : y === 11 ? ST[5] : pick(ST, m6 === 3 ? 1.6 : 3.6);
        else col = y <= 12 ? ST[2] : y <= 14 ? ST[0] : ST[5];
      } else if (y === 16) col = ST[6];
      else if (y === 17) col = '#24211c';
      else if (inArch) {
        // the raised drawbridge fills the arch: boards, iron bands, rivets
        const board = Math.floor((dx + 9) / 3), bx = ((Math.floor(dx + 9) % 3) + 3) % 3;
        col = bx === 0 ? WOOD[0] : WOOD[1 + Math.floor(h.hash(board, Math.floor(y / 5) + sd) * 2.6)];
        if (bx === 1 && h.hash(board, y) < 0.15) col = WOOD[3];
        if (y === 25 || y === 36) col = IRON[1];
        if ((y === 25 || y === 36) && bx === 1) col = IRON[2];
        if (y < archTop + 1) col = WOOD[0];
      } else if (Math.abs(dx) < 11 && y >= archTop - 2 && y <= 41) {
        // voussoirs round the arch
        const ang = Math.atan2(y - 30, dx), v = Math.floor(ang * 5);
        col = v % 2 ? ST[5] : ST[4];
        if (dx > 0) col = v % 2 ? ST[4] : ST[3];
      } else if (y <= 41) {
        const l = ashlar(h, X, y, 18, 3.0, sd);
        col = l === 1 ? ST[1] : pick(ST, l);
      } else if (y <= 44) col = y === 44 ? '#1d2a2e' : pick(ST, 2 + h.hash(X, y) * 1.4);
      if (col) dot(c, tx, y, col);
    }
  }
  // the chains that hauled it up, running from its top corners into the gatehouse
  const L = Math.round(cx) - 7 + TEXOFF, Rr = Math.round(cx) + 6 + TEXOFF;
  for (let i = 0; i < 8; i++) {
    dot(c, L - Math.floor(i / 2), 23 - i, i % 2 ? IRON[2] : IRON[1]);
    dot(c, Rr + Math.floor(i / 2), 23 - i, i % 2 ? IRON[2] : IRON[1]);
  }
  dot(c, L - 4, 15, INK); dot(c, Rr + 4, 15, INK);
  if (stage > 0) {
    // splintered boards, then holes showing the portcullis behind
    for (let k = 0; k < stage * 2; k++) {
      const bx = Math.round(cx) - 8 + Math.floor(h.hash(k, sd + 3) * 15), top = 24 + Math.floor(h.hash(sd, k) * 10), len = 4 + stage * 2;
      for (let y = top; y < Math.min(41, top + len); y++) {
        const hole = stage >= 2 && k < stage;
        dot(c, bx + TEXOFF, y, hole ? (y % 3 === 0 ? IRON[1] : '#0c0a08') : '#1a120a');
        if (hole) dot(c, bx + 1 + TEXOFF, y, (y % 3 === 0 || (bx + 1) % 3 === 0) ? IRON[1] : '#0c0a08');
        if (!hole && h.hash(bx, y) < 0.3) dot(c, bx + 1 + TEXOFF, y, WOOD[3]);
      }
    }
  }
}

// a section knocked through: broken stubs either side, the dark street beyond, a slope of rubble down to the moat
function paintBreach(c, s, h) {
  const w = s.x1 - s.x0, mid = (s.x0 + s.x1) / 2, sd = s.i * 7;
  c.clearRect(s.x0 + TEXOFF, 0, w, TH);
  for (let X = s.x0; X < s.x1; X++) {
    const tx = X + TEXOFF, e = Math.min(X - s.x0, s.x1 - 1 - X);
    const stub = e < 3 ? 14 + Math.floor(h.hash(X, sd) * 9) + e * 4 : 99;   // ragged broken ends
    const mound = 44 - Math.max(0, 13 * (1 - ((X - mid) / (w / 2 + 5)) ** 2)) - h.hash(X, 3) * 2;
    for (let y = 12; y < 46; y++) {
      let col;
      if (y >= mound) col = y > 43 ? '#1d2a2e' : pick(ST, 1.5 + h.hash(X * 3, y) * 4 - (y - mound) * 0.15);
      else if (y >= stub) col = y === stub ? ST[6] : pick(ST, 3 + (h.hash(X, y) - 0.5) * 2);
      else if (y > 12 + (e < 6 ? 0 : 0)) {
        // the street inside, a lamp-lit window or two
        col = y > 32 ? (h.hash(X, y) < 0.3 ? '#3a3226' : '#2c261e') : '#15120e';
        if (y > 14 && y < 31 && (y % 6 === 1 || y % 6 === 2) && X % 4 === 1 && h.hash(Math.floor(X / 4), Math.floor(y / 6) + sd) < 0.3) col = y % 6 === 1 ? '#f0c060' : '#b07a30';
        else if (y > 13 && y < 32 && h.hash(Math.floor(X / 9) + sd, 5) < 0.5 && y > 14 + Math.floor(h.hash(Math.floor(X / 9), sd) * 6)) col = '#1f1a14';
      }
      if (col) dot(c, tx, y, col);
    }
    if (stub === 99 && h.hash(X, 77) < 0.08) dot(c, tx, mound - 1, ST[6]);
  }
}

function paintSection(c, s, stage, h) {
  c.clearRect(s.x0 + TEXOFF, 0, s.x1 - s.x0, TH);
  if (stage >= 4) return paintBreach(c, s, h);
  if (s.kind === 'wl_tower') paintTower(c, s, stage, h);
  else if (s.kind === 'wl_gate') paintGate(c, s, stage, h);
  else paintCurtain(c, s, stage, h);
}
const stageOf = s => {
  const p = s.prop;
  if (!p) return 0;
  if (p.state !== 'up') return 4;
  const f = p.hp / p.maxhp;
  return f > 0.8 ? 0 : f > 0.55 ? 1 : f > 0.3 ? 2 : 3;
};

// the city behind the wall: two rows of roofs, church spires and, in the middle, the castle keep
function paintRoofs(c, h, seed) {
  c.fillStyle = '#121310'; c.fillRect(0, 0, WW, RH);
  const ROOF = [['#3a1c14', '#5a2c1e', '#74402a', '#8c5434'], ['#20242c', '#2e3440', '#3e4656', '#525c6e'], ['#3a3018', '#54462a', '#6e5c36', '#867044']];
  const house = (x0, bw, top, bot, pal, dim) => {
    const ridge = top + 1;
    for (let x = x0; x < x0 + bw; x++) for (let y = top; y <= bot; y++) {
      const X = ((x % WW) + WW) % WW;
      let l = y === ridge ? 3 : y < ridge ? 2 : 2 - (y - ridge) / Math.max(1, bot - ridge) * 1.6;
      if (x === x0 || x === x0 + bw - 1 || y === top) { dot(c, X, y, INK); continue; }
      if (x === x0 + 1) l += 0.5;
      if (x > x0 + bw * 0.65) l -= 0.5;
      if ((x - x0) % 2 === 0 && y > ridge) l -= 0.35;
      l += (h.hash(x, y + seed) - 0.5) * 0.4 - dim;
      dot(c, X, y, pick(pal, l));
    }
    if (h.hash(x0, seed) < 0.4) { const cx = x0 + 2 + Math.floor(h.hash(seed, x0) * (bw - 4)); for (let y = top - 2; y < top + 1; y++) { dot(c, ((cx % WW) + WW) % WW, y, '#3a3630'); dot(c, ((cx + 1) % WW + WW) % WW, y, '#24211c'); } }
  };
  // back row
  for (let x = 0; x < WW;) { const bw = 7 + Math.floor(h.hash(x, seed) * 8); house(x, bw, 2 + Math.floor(h.hash(seed, x) * 4), 14, ROOF[Math.floor(h.hash(x, 5) * 3)], 0.7); x += bw - 1; }
  // spires
  for (let x = 90; x < WW; x += 150 + Math.floor(h.hash(x, seed) * 90)) {
    for (let y = 0; y < 16; y++) { const hw = Math.floor(y / 3); for (let dx = -hw; dx <= hw; dx++) dot(c, x + dx, y, Math.abs(dx) === hw ? INK : dx < 0 ? '#525c6e' : '#3a4252'); }
    dot(c, x, 0, '#e8c050');
    for (let y = 16; y < 22; y++) for (let dx = -3; dx <= 3; dx++) dot(c, x + dx, y, Math.abs(dx) === 3 ? INK : dx < 0 ? '#827b67' : '#6a6455');
    dot(c, x, 18, '#e8b04a');
  }
  // the keep, far behind the gate: you will get there
  const kx = 860;
  for (let x = kx - 16; x < kx + 16; x++) for (let y = 0; y < RH; y++) {
    const e = x === kx - 16 || x === kx + 15, m = (x - kx + 16) % 5 < 3;
    let col = e ? INK : pick(['#3e3a32', '#4f4a40', '#655f51', '#7a7362'], 2.5 - (x - kx) / 12 + (h.hash(x, y) - 0.5) * 0.6);
    if (y < 2 && !m) col = null;
    if (y === 2 && m) col = '#8f8873';
    if ((y === 8 || y === 9) && (x - kx + 16) % 8 === 4) col = '#e8b04a';
    if (col) dot(c, x, y, col);
  }
  // front row, lower
  for (let x = 3; x < WW;) { const bw = 8 + Math.floor(h.hash(x, seed + 1) * 9); if (Math.abs(x - kx) > 20 || h.hash(x, 2) < 0.5) house(x, bw, 9 + Math.floor(h.hash(seed + 2, x) * 4), RH - 1, ROOF[Math.floor(h.hash(x, 6) * 3)], 0.3); x += bw + Math.floor(h.hash(x, 8) * 3) - 1; }
}

// ---------------------------------------------------------------------------------------------- art: drawing the drum

function under(ctx, g, h) {
  const m = g.map, V = h.VIEW, W = h.W;
  const tex = h.sprite(`wl-tex-${m.key}`, TEXW, TH, c => { for (const s of m.wall) { paintSection(c, s, 0, h); s.drawn = 0; } });
  const tc = tex.getContext('2d');
  for (const s of m.wall) { const st = stageOf(s); if (st !== s.drawn) { paintSection(tc, s, st, h); s.drawn = st; } }
  const roofs = h.sprite(`wl-roofs-${m.key}`, WW, RH, c => paintRoofs(c, h, m.key % 997));
  const off = h.sprite('wl-off', W, TH, () => {}), oc = off.getContext('2d');
  oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, W, TH);
  // the wall turns about the boss (within a little of the screen middle), so what is above you is what you can bash,
  // even where the camera stops at the ends of the world. The rooftops turn about the screen middle.
  const piv = W / 2 + Math.max(-38, Math.min(38, Math.round(g.boss.x - V.x - W / 2))), C = V.x + piv, CR = V.x + W / 2;

  // the rooftops, on the smaller drum: they turn past slower, and their line bows up less
  for (let sx = 0; sx < W; sx++) {
    const q = (sx + 0.5 - W / 2) / R2;
    const th = Math.asin(q), u = Math.floor(CR + th * R) % WW;
    oc.drawImage(roofs, (u + WW) % WW, 0, 1, RH, sx, Math.round(-CURVE2 * (1 - Math.cos(th))), 1, RH);
  }
  // the wall, on the big drum
  for (let sx = 0; sx < W; sx++) {
    const q = (sx + 0.5 - piv) / R;
    const th = Math.asin(q), u = Math.max(0, Math.min(TEXW - 1, Math.floor(C + th * R) + TEXOFF));
    oc.drawImage(tex, u, 0, 1, TH, sx, Math.round(-CURVE * (1 - Math.cos(th))), 1, TH);
  }
  // towers stand proud of the curtain, so as one turns away from the middle its inward flank comes into view
  const side = h.sprite('wl-towerside', 8, TH, c => {
    for (let x = 0; x < 8; x++) for (let y = 2; y < 44; y++) {
      let col = (y - 11) % 4 === 3 || y === 10 ? ST[0] : pick(ST, 1.9 - x * 0.12 + (h.hash(x, y) - 0.5) * 0.8 + ((y - 11) % 4 === 0 ? 0.4 : 0));
      if (y < 8) col = y < 4 && x % 3 === 1 ? null : y === 2 || y === 4 ? ST[4] : ST[2];
      if (y === 8 || y === 9) col = (x + y) % 2 ? INK : ST[3];
      if (y > 37 && h.hash(x * 3, y) < (y - 37) * 0.1) col = MOSS[0];
      if (y === 43) col = '#1d2a2e';
      if (col) dot(c, x, y, col);
    }
  });
  for (const s of m.wall) {
    if (s.kind !== 'wl_tower' || stageOf(s) >= 4) continue;
    const mid = (s.x0 + s.x1) / 2, right = mid > C, ex = right ? s.x0 : s.x1, th = (ex - C) / R;
    if (Math.abs(th) > 1.45) continue;
    const n = Math.round(9 * Math.abs(Math.sin(th))), e = piv + R * Math.sin(th);
    for (let i = 0; i < n; i++) {
      const sx = Math.round(right ? e - 1 - i : e + i);
      if (sx < 0 || sx >= W) continue;
      const q = (sx + 0.5 - piv) / R, yo = Math.round(-CURVE * (1 - Math.cos(Math.asin(Math.max(-1, Math.min(1, q))))));
      oc.drawImage(side, right ? 7 - Math.min(7, i) : Math.min(7, i), 0, 1, TH, sx, yo, 1, TH);
    }
    // a dark seam where the flank meets the curtain
    const sx = Math.round(right ? e - 1 - n : e + n);
    if (n && sx >= 0 && sx < W) { const q = (sx + 0.5 - piv) / R, yo = Math.round(-CURVE * (1 - Math.cos(Math.asin(Math.max(-1, Math.min(1, q)))))); oc.fillStyle = 'rgba(10,8,6,0.55)'; oc.fillRect(sx, yo + 10, 1, 33); }
  }
  // shade the drum: lit from the left, turning away into shadow on the right, darker at both edges
  oc.globalCompositeOperation = 'source-atop';
  const grd = oc.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= 10; i++) {
    const q = (i / 10 - 0.5) * 2 * (W / 2) / R, th = Math.asin(q), e = (1 - Math.cos(th)) / (1 - Math.cos(Math.asin(W / 2 / R)));
    const a = th < 0 ? 0.1 + e * 0.3 : 0.08 + e * 0.6;
    grd.addColorStop(i / 10, `rgba(8,10,14,${a.toFixed(3)})`);
  }
  oc.fillStyle = grd; oc.fillRect(0, 0, W, TH);
  const hi = oc.createLinearGradient(0, 0, W, 0);
  hi.addColorStop(0.05, "rgba(255,236,190,0)"); hi.addColorStop(0.3, "rgba(255,236,190,0.05)"); hi.addColorStop(0.55, "rgba(255,236,190,0)");
  oc.fillStyle = hi; oc.fillRect(0, 0, W, TH);
  // a white flash on whatever piece just took a hit, wherever it is on the drum
  for (const s of m.wall) {
    const p = s.prop;
    if (!p || p.hitT <= 0 || p.state !== 'up') continue;
    const a = toScreen(s.x0, C, W, piv), b = toScreen(s.x1, C, W, piv);
    if (b < 0 || a > W) continue;
    oc.fillStyle = `rgba(255,255,255,${(p.hitT / 0.12 * 0.45).toFixed(3)})`;
    oc.fillRect(Math.floor(a), 0, Math.ceil(b - a), TH);
  }
  oc.globalCompositeOperation = 'source-over';

  // the wall's shadow on the water, old piles where the bridge stood, reeds along the bank
  ctx.fillStyle = 'rgba(6,10,14,0.28)'; ctx.fillRect(V.x, MOAT0 + 2, W, 4);
  ctx.fillStyle = 'rgba(6,10,14,0.14)'; ctx.fillRect(V.x, MOAT0 + 6, W, 3);
  if (Math.abs(OLD_X - C) < W) for (const [x, y] of [[OLD_X - 8, 49], [OLD_X + 7, 50], [OLD_X - 9, 61], [OLD_X + 8, 62], [OLD_X + 2, 56]]) {
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 3, 4, 5);
    ctx.fillStyle = WOOD[1]; ctx.fillRect(x, y - 2, 2, 3);
    ctx.fillStyle = WOOD[3]; ctx.fillRect(x, y - 2, 2, 1);
    ctx.fillStyle = 'rgba(160,200,220,0.35)'; ctx.fillRect(x - 1, y + 1, 4, 1);
  }
  const fr = Math.floor(g.t * 2);
  for (let x = V.x - 2; x < V.x + W + 2; x++) {
    if (h.hash(x, 41) > 0.16 || !isWater(g, x, MOAT1 - 2)) continue;
    const t = h.hash(x, 3), sway = h.hash(x, fr) < 0.15 ? 1 : 0;
    ctx.fillStyle = t < 0.5 ? MOSS[1] : MOSS[2];
    ctx.fillRect(x + sway, MOAT1 - 4 - Math.floor(t * 3), 1, 4 + Math.floor(t * 3));
    if (t > 0.8) { ctx.fillStyle = '#5a4428'; ctx.fillRect(x + sway, MOAT1 - 6 - Math.floor(t * 3), 1, 2); }
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(V.x + h.hash(i, Math.floor(V.x / 200)) * W), y = MOAT0 + 12 + Math.floor(h.hash(i, 9) * 14);
    if (!isWater(g, x, y)) continue;
    ctx.fillStyle = '#2e4a26'; ctx.fillRect(x, y, 3, 2); ctx.fillStyle = '#4a6a34'; ctx.fillRect(x, y, 2, 1);
  }
  ctx.drawImage(off, V.x, 0);
}
const toScreen = (x, C, W, piv) => { const th = (x - C) / R; return Math.abs(th) >= Math.PI / 2 ? (th < 0 ? -1 : W + 1) : piv + R * Math.sin(th); };

// ---------------------------------------------------------------------------------------------- art: the ground

const GR = ['#28381e', '#2f4224', '#374c2a', '#415833'];
const DIRT = ['#3f3222', '#4e3f2a', '#5e4c32', '#6e5a3a'];
function ground(ctx, m, h) {
  const { hash, vnoise } = h;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    let col;
    if (y < MOAT0) col = y > 30 ? (hash(x, y) < 0.3 ? '#2a2a20' : '#22231a') : '#1a1a16';   // the scarp under the wall
    else if (y < MOAT1 + 4) col = y >= MOAT1 ? (y === MOAT1 ? '#1e2218' : hash(x, y) < 0.5 ? DIRT[1] : DIRT[0]) : '#22343c';
    else {
      const n = vnoise(x / 30, y / 30) * 0.55 + vnoise(x / 9 + 40, y / 9) * 0.3 + hash(x, y) * 0.2;
      col = GR[Math.max(0, Math.min(3, Math.floor(n * 3.4 - 0.3 + ((x + y) & 1) * 0.3)))];
    }
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  // muddy bank, grass growing over its edge
  for (let x = 0; x < m.w; x++) { const g = Math.floor(hash(x, 5) * 3); for (let y = MOAT1 + 4 - g; y < MOAT1 + 6; y++) if (hash(x, y) < 0.6) { ctx.fillStyle = GR[2]; ctx.fillRect(x, y, 1, 1); } }
  // three ploughed plots
  for (const [fx, fy, fw, fh] of [[160, 146, 90, 22], [520, 150, 70, 20], [1100, 144, 110, 26]]) {
    for (let y = fy; y < Math.min(m.h, fy + fh); y++) for (let x = fx; x < fx + fw; x++) {
      if (hash(x, y) < 0.08) continue;
      ctx.fillStyle = (y - fy) % 3 === 0 ? DIRT[0] : (y - fy) % 3 === 1 ? DIRT[2] : DIRT[1];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // the road, the lane up to the gate, and the old way to the fallen bridge (grassed over)
  const road = (x, y, w, worn) => {
    for (let dy = -w; dy <= w; dy++) {
      const e = Math.abs(dy) / w;
      if (hash(x, y + dy) > worn - e * 0.5) continue;
      ctx.fillStyle = Math.abs(dy) === Math.round(w * 0.45) && hash(x, 7) < 0.8 ? DIRT[0] : DIRT[1 + Math.floor(hash(x + dy, y) * 3)];
      ctx.fillRect(x, y + dy, 1, 1);
    }
  };
  for (let x = 0; x < m.w; x++) road(x, Math.round(m.roadY(x)), 5, 1.1);
  for (let y = MOAT1 + 2; y < m.roadY(860); y++) { const x = Math.round(gateLaneX(y)); for (let dx = -5; dx <= 5; dx++) { const e = Math.abs(dx) / 5; if (hash(x + dx, y) < 1.1 - e * 0.5) { ctx.fillStyle = DIRT[1 + Math.floor(hash(x + dx, y * 3) * 3)]; ctx.fillRect(x + dx, y, 1, 1); } } }
  for (let y = MOAT1 + 2; y < m.roadY(OLD_X); y++) { const x = Math.round(OLD_X + Math.sin(y / 11) * 4); for (let dx = -4; dx <= 4; dx++) if (hash(x + dx, y) < 0.45 - Math.abs(dx) * 0.06) { ctx.fillStyle = DIRT[1 + Math.floor(hash(x, y + dx) * 2)]; ctx.fillRect(x + dx, y, 1, 1); } }
  // the drawbridge's landing: cobbles and two chain posts
  const gx = (GATE_X0 + GATE_X1) / 2;
  for (let y = MOAT1 - 1; y < MOAT1 + 12; y++) for (let x = gx - 15; x <= gx + 15; x++) {
    const j = (x + (Math.floor(y / 2) % 2)) % 3 === 0 || y % 2 === 0;
    ctx.fillStyle = j ? '#3f403a' : ['#6b6c63', '#5f6058', '#7a7a70'][Math.floor(hash(x, y) * 3)];
    ctx.fillRect(x, y, 1, 1);
  }
  for (const px of [gx - 14, gx + 13]) { ctx.fillStyle = INK; ctx.fillRect(px - 1, MOAT1 - 1, 4, 7); ctx.fillStyle = '#55564f'; ctx.fillRect(px, MOAT1, 2, 5); ctx.fillStyle = '#8f8f84'; ctx.fillRect(px, MOAT1, 2, 1); }
  // stones, flowers, tufts
  for (let i = 0; i < m.w * 2; i++) {
    const x = Math.floor(hash(i, 7) * m.w), y = MOAT1 + 6 + Math.floor(hash(i, 13) * (m.h - MOAT1 - 6)), t = hash(i, 3);
    ctx.fillStyle = t < 0.1 ? '#8f8f84' : t < 0.16 ? '#c8b85a' : t < 0.2 ? '#b07aa0' : t < 0.6 ? '#4a6a2e' : '#22301a';
    ctx.fillRect(x, y, 1, 1);
  }
}

// ---------------------------------------------------------------------------------------------- art: buildings and rubble

const THATCH = ['#4a3a1e', '#64502a', '#7e6834', '#9a8244', '#b49a56'];
const SLATE = ['#262b34', '#343b48', '#454e5e', '#5a6476', '#727c90'];
const SHINGLE = ['#3a2016', '#55301e', '#6e4028', '#875234', '#9e6440'];

// a house in 3/4: the roof is the footprint lifted by the wall height, the front wall shows below it
function paintHouse(c, kind, W, D, v, h) {
  const wallH = kind === 'wl_barn' ? 7 : 6, pal = kind === 'wl_cottage' ? THATCH : kind === 'wl_house' ? SLATE : SHINGLE;
  const ox = 1, oy = 1, mid = oy + Math.floor(D / 2) - 1;
  // shadow to the lower right
  c.fillStyle = 'rgba(6,8,6,0.4)'; c.fillRect(ox + 2, oy + wallH + 2, W, D); c.fillRect(ox + W, oy + 3, 2, D + wallH - 1);
  // front wall
  for (let x = ox; x < ox + W; x++) for (let y = oy + D; y < oy + D + wallH; y++) {
    const lx = x - ox, ly = y - oy - D;
    let col;
    if (kind === 'wl_cottage') {
      const post = lx === 1 || lx === W - 2 || lx === Math.floor(W / 2) + 2 || ly === 0 || ly === wallH - 1;
      col = post ? '#4a3020' : ly === 1 ? '#a8946c' : h.hash(lx + v * 7, ly) < 0.15 ? '#b49e74' : '#c8b48a';
    } else if (kind === 'wl_house') {
      col = ly % 3 === 2 || (lx + (Math.floor(ly / 3) % 2) * 3) % 6 === 0 ? '#4a463d' : ['#7a7464', '#8a8370', '#6c6758'][Math.floor(h.hash(lx + v * 9, ly) * 3)];
    } else {
      col = lx % 3 === 0 ? WOOD[0] : WOOD[1 + Math.floor(h.hash(lx, v) * 2)];
    }
    if (lx === 0) col = INK; else if (lx === W - 1) col = INK;
    if (ly === wallH - 1 && (lx === 0 || lx === W - 1)) col = INK;
    dot(c, x, y, col);
  }
  // door and windows
  const dx = ox + Math.floor(W * (0.3 + (v % 3) * 0.15)), by = oy + D + wallH - 1;
  if (kind === 'wl_barn') {
    const bw = 8, bx = ox + Math.floor((W - bw) / 2);
    for (let x = bx; x < bx + bw; x++) for (let y = by - 5; y <= by; y++) {
      const lx = x - bx, ly = by - y;
      dot(c, x, y, x === bx || x === bx + bw - 1 || y === by - 5 ? INK : Math.abs(lx - ly * 1.4) < 1 || Math.abs((bw - 1 - lx) - ly * 1.4) < 1 ? WOOD[3] : WOOD[1]);
    }
  } else {
    for (let y = by - 3; y <= by; y++) { dot(c, dx, y, '#24160c'); dot(c, dx + 1, y, '#2e1c10'); dot(c, dx + 2, y, y === by - 3 ? INK : '#2e1c10'); }
    dot(c, dx, by - 4, INK); dot(c, dx + 1, by - 4, INK);
    for (const wx of [ox + 2 + (v % 2), ox + W - 5]) if (Math.abs(wx - dx) > 3) {
      c.fillStyle = INK; c.fillRect(wx - 1, by - 4, 4, 3);
      c.fillStyle = h.hash(wx, v) < 0.7 ? '#f0c050' : '#3a3428'; c.fillRect(wx, by - 3, 2, 1);
      if (h.hash(wx, v) < 0.7) dot(c, wx, by - 3, '#ffe890');
    }
  }
  // roof: north slope catches the light, south slope in shade, ridge on top, ink eaves
  for (let x = ox - 1; x <= ox + W; x++) for (let y = oy; y < oy + D + 1; y++) {
    const lx = x - ox;
    let l = y < mid ? 3 - (mid - y) * 0.15 : y === mid ? 4 : 2.2 - (y - mid) / (D - mid) * 1.2;
    if (kind === 'wl_cottage') l += (h.hash(x * 2 + v, Math.floor(y / 2)) - 0.5) * 1.1 + ((x + v) % 3 === 0 ? -0.4 : 0);
    else if (kind === 'wl_house') l += (y % 2 === 0 ? -0.5 : 0) + (((x + (y % 4 < 2 ? 0 : 2)) % 4 === 0) ? -0.5 : 0) + (h.hash(x, y) - 0.5) * 0.4;
    else l += ((x + Math.floor(y / 2)) % 3 === 0 ? -0.5 : 0) + (h.hash(x, y + v) - 0.5) * 0.5;
    if (lx === -1) l += 0.6; else if (lx === W) l -= 0.8;
    let col = pick(pal, l);
    if (y === oy || y === oy + D || lx === -1 && y > mid + 1 || lx === W) col = INK;
    dot(c, x, y, col);
  }
  if (kind === 'wl_house') {
    // a chimney
    const cx = ox + W - 6;
    for (let y = oy - 1; y < oy + 4; y++) { dot(c, cx, y, INK); dot(c, cx + 1, y, '#8a8370'); dot(c, cx + 2, y, '#5a564a'); dot(c, cx + 3, y, INK); }
    dot(c, cx + 1, oy - 1, '#2a2622'); dot(c, cx + 2, oy - 1, '#2a2622');
  }
  if (kind === 'wl_barn') {
    // a hay loft door in the gable, and the ridge vent
    const vx = ox + Math.floor(W / 2) - 1;
    for (let x = vx; x < vx + 3; x++) { dot(c, x, mid - 1, INK); dot(c, x, mid, '#2a1a10'); }
  }
}

function paintWatch(c, v, h) {
  // a round stone watchtower under a conical roof
  const cx = 9, roofB = 11, bodyB = 25, pal = v % 2 ? SLATE : SHINGLE;
  c.fillStyle = 'rgba(6,8,6,0.4)'; c.fillRect(cx - 3, bodyB - 1, 13, 3);
  for (let x = cx - 6; x <= cx + 6; x++) {
    const nx = (x - cx) / 6.5, a = Math.asin(Math.max(-1, Math.min(1, nx))), lit = 3.2 - nx * 1.7 - nx * nx;
    for (let y = roofB - 1; y <= bodyB; y++) {
      const course = Math.floor((y - roofB) / 3), row = ((y - roofB) % 3 + 3) % 3;
      const sid = Math.floor(a * 2.6 + course * 0.5), sidL = Math.floor(Math.asin(Math.max(-1, Math.min(1, nx - 0.15))) * 2.6 + course * 0.5);
      let col = row === 2 || sid !== sidL ? pick(ST, lit - 1.5) : pick(ST, lit + (row === 0 ? 0.5 : 0) + (h.hash(sid + v, course) - 0.5) * 0.8);
      if (Math.abs(x - cx) === 6 || y === bodyB) col = INK;
      dot(c, x, y, col);
    }
  }
  // door and a slit window
  for (let y = bodyB - 5; y < bodyB; y++) for (let x = cx - 1; x <= cx + 1; x++) dot(c, x, y, y === bodyB - 5 && x !== cx ? pick(ST, 3) : x === cx + 1 ? '#2a1a10' : '#3a2416');
  dot(c, cx, bodyB - 6, INK); dot(c, cx - 2, roofB + 4, INK); dot(c, cx - 2, roofB + 5, INK); dot(c, cx - 1, roofB + 4, '#e8b04a');
  // the cone: lit on the left, seams running down from the point, an ink eave
  for (let y = 1; y <= roofB; y++) {
    const hw = Math.round(1 + (y - 1) / (roofB - 1) * 7.5);
    for (let dx = -hw; dx <= hw; dx++) {
      const k = dx / hw;
      let l = 2.8 - k * 1.6 - (y > roofB - 2 ? 0.4 : 0) + (h.hash(dx + v * 5, y) - 0.5) * 0.5;
      if (Math.round(k * 4) !== Math.round((dx - 1) / hw * 4)) l -= 0.7;
      dot(c, cx + dx, y, Math.abs(dx) === hw || y === roofB ? INK : pick(pal, l));
    }
  }
  dot(c, cx, 0, '#e8c050'); dot(c, cx, 1, IRON[2]);
}

function drawBuilding(ctx, p, g, h) {
  const d = kinds[p.kind], v = p.seed % 4, x = Math.round(p.x), y = Math.round(p.y);
  if (p.state === 'down') return drawRuin(ctx, p, g, h);
  let spr, sx, sy;
  if (p.kind === 'wl_watch') {
    spr = h.sprite(`wl-watch${v}`, 19, 28, c => paintWatch(c, v, h));
    sx = x - 9; sy = y + 4 - 25;
  } else {
    const wallH = p.kind === 'wl_barn' ? 7 : 6;
    spr = h.sprite(`wl-${p.kind}${v}`, d.w + 4, d.h + wallH + 4, c => paintHouse(c, p.kind, d.w, d.h, v, h));
    sx = x - d.w / 2 - 1; sy = y + d.h / 2 - d.h - wallH - 1;
  }
  sx = Math.round(sx); sy = Math.round(sy);
  ctx.drawImage(spr, sx, sy);
  // cracks as it takes a beating
  const k = 1 - p.hp / p.maxhp;
  if (k > 0.3) {
    ctx.fillStyle = INK;
    const n = Math.floor(k * 8);
    for (let i = 0; i < n; i++) {
      let cx = sx + 3 + Math.floor(h.hash(p.seed, i) * (spr.width - 7)), cy = sy + 3 + Math.floor(h.hash(i, p.seed) * (spr.height - 6));
      for (let j = 0; j < 4; j++) { ctx.fillRect(cx, cy, 1, 1); cy++; cx += Math.floor(h.hash(cx, cy) * 3) - 1; }
    }
  }
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / d.burnTime * 0.9); ctx.drawImage(h.tinted(spr, '#1a120c'), sx, sy); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), sx, sy); ctx.globalAlpha = 1; }
}

// what is left of a timber building once it is down: a charred frame and fallen beams
function drawRuin(ctx, p, g, h) {
  const d = kinds[p.kind], v = p.seed % 3, W = d.w || 9, D = d.h || 6;
  const spr = h.sprite(`wl-ruin-${p.kind}${v}`, W + 4, D + 4, c => {
    for (let y = 1; y < D + 3; y++) for (let x = 1; x < W + 3; x++) {
      const t = h.hash(x * 3 + v, y);
      if (t < 0.25) continue;
      c.fillStyle = t > 0.9 ? '#5a5248' : t > 0.6 ? '#1c1814' : t > 0.45 ? THATCH[0] : '#2a241e';
      c.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 3 + (W >> 3); i++) {
      const a = h.hash(i, v) * Math.PI, L = 4 + Math.floor(h.hash(v, i) * (W / 2)), x0 = 2 + h.hash(i, 9) * (W - 2), y0 = 2 + h.hash(9, i) * (D - 1);
      for (let j = 0; j < L; j++) { const x = Math.round(x0 + Math.cos(a) * j), y = Math.round(y0 + Math.sin(a) * j * 0.6); if (x < 0 || y < 0 || x > W + 3 || y > D + 3) continue; c.fillStyle = INK; c.fillRect(x, y + 1, 1, 1); c.fillStyle = j % 3 ? WOOD[1] : WOOD[0]; c.fillRect(x, y, 1, 1); }
    }
    if (p.kind === 'wl_stall') { c.fillStyle = '#a8362a'; c.fillRect(3, 2, 3, 1); c.fillStyle = '#d8c39a'; c.fillRect(6, 3, 2, 1); }
  });
  const sx = Math.round(p.x - W / 2 - 2), sy = Math.round(p.y - D / 2 - 2);
  ctx.drawImage(spr, sx, sy);
  if (p.burning) { ctx.globalAlpha = Math.min(0.8, p.burnT / d.burnTime * 0.9); ctx.drawImage(h.tinted(spr, '#120c08'), sx, sy); ctx.globalAlpha = 1; }
}

function drawCart(ctx, p, g, h) {
  if (p.state === 'down') return drawRuin(ctx, p, g, h);
  const v = p.seed % 2;
  const spr = h.sprite(`wl-cart${v}`, 12, 10, c => {
    c.fillStyle = 'rgba(6,8,6,0.4)'; c.fillRect(3, 7, 9, 2);
    c.fillStyle = INK; c.fillRect(1, 1, 9, 7);
    for (let x = 2; x < 9; x++) for (let y = 2; y < 7; y++) { c.fillStyle = v ? (h.hash(x, y) < 0.5 ? THATCH[3] : THATCH[2]) : (y < 4 ? '#7a7464' : '#5a564a'); c.fillRect(x, y, 1, 1); }
    if (!v) { c.fillStyle = '#8f8873'; c.fillRect(3, 2, 2, 1); c.fillRect(6, 3, 2, 1); }
    c.fillStyle = WOOD[2]; c.fillRect(1, 6, 9, 1);
    for (const wx of [1, 7]) { c.fillStyle = INK; c.fillRect(wx, 6, 3, 3); c.fillStyle = WOOD[1]; c.fillRect(wx + 1, 7, 1, 1); }
    c.fillStyle = WOOD[3]; c.fillRect(10, 4, 2, 1); c.fillStyle = INK; c.fillRect(10, 5, 2, 1);
  });
  const sx = Math.round(p.x) - 6, sy = Math.round(p.y) - 7;
  ctx.drawImage(spr, sx, sy);
  if (p.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), sx, sy); ctx.globalAlpha = 1; }
}

function drawStall(ctx, p, g, h) {
  if (p.state === 'down') return drawRuin(ctx, p, g, h);
  const v = p.seed % 3, col = ['#a8362a', '#3a6a9a', '#5a8a3a'][v];
  const spr = h.sprite(`wl-stall${v}`, 15, 13, c => {
    c.fillStyle = 'rgba(6,8,6,0.4)'; c.fillRect(3, 9, 12, 3);
    // posts and a counter of goods, under a striped awning
    c.fillStyle = INK; c.fillRect(1, 7, 13, 4);
    c.fillStyle = WOOD[2]; c.fillRect(2, 8, 11, 2);
    for (let x = 3; x < 12; x += 2) { c.fillStyle = ['#d8a040', '#a8c050', '#c05a3a'][(x + v) % 3]; c.fillRect(x, 7, 1, 1); }
    c.fillStyle = INK; c.fillRect(0, 1, 15, 7);
    for (let x = 1; x < 14; x++) for (let y = 2; y < 7; y++) { c.fillStyle = (Math.floor(x / 2) % 2) ? (y < 4 ? '#f4ecd2' : '#d8cfb4') : (y < 4 ? col : shadeHex(col)); c.fillRect(x, y, 1, 1); }
    for (let x = 1; x < 14; x += 2) { c.fillStyle = INK; c.fillRect(x, 7, 1, 1); }
  });
  const sx = Math.round(p.x) - 7, sy = Math.round(p.y) - 9;
  ctx.drawImage(spr, sx, sy);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / 4 * 0.9); ctx.drawImage(h.tinted(spr, '#1a120c'), sx, sy); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), sx, sy); ctx.globalAlpha = 1; }
}
const shadeHex = c => '#' + [1, 3, 5].map(i => Math.floor(parseInt(c.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');

// shoveable rubble
function drawRubble(ctx, p, g, h) {
  const v = p.seed % 3, k = p.kind;
  const spr = h.sprite(`wl-${k}${v}`, 11, 10, c => {
    c.fillStyle = 'rgba(6,8,6,0.4)'; c.fillRect(3, 7, 7, 2);
    if (k === 'wl_timber') {
      // two beams, one across the other, and a splinter
      const beam = (x0, y0, dx, dy, n) => { for (let i = 0; i < n; i++) { const x = x0 + Math.round(dx * i), y = y0 + Math.round(dy * i); c.fillStyle = INK; c.fillRect(x - 1, y - 1, 3, 3); } for (let i = 0; i < n; i++) { const x = x0 + Math.round(dx * i), y = y0 + Math.round(dy * i); c.fillStyle = WOOD[2]; c.fillRect(x, y, 1, 1); c.fillStyle = i % 3 ? WOOD[3] : WOOD[2]; c.fillRect(x, y - 0, 1, 1); c.fillStyle = WOOD[1]; c.fillRect(x, y + 1, 1, 0); } };
      beam(2, 3 + v, 1, 0.35, 7);
      beam(3 + v, 7, 0.8, -0.6, 6);
      c.fillStyle = '#d8c39a'; c.fillRect(8, 3 + v, 1, 1);
    } else if (k === 'wl_block') {
      // a cut ashlar block: lit top, front face, shaded side
      c.fillStyle = INK; c.fillRect(1, 1, 9, 8);
      c.fillStyle = ST[6]; c.fillRect(2, 2, 6, 2);
      c.fillStyle = ST[4]; c.fillRect(2, 4, 6, 4);
      c.fillStyle = ST[2]; c.fillRect(8, 2, 1, 6);
      c.fillStyle = ST[3]; c.fillRect(3 + v, 5, 1, 1); c.fillRect(5, 6, 2, 1);
      c.fillStyle = ST[5]; c.fillRect(2, 4, 1, 3);
    } else {
      // a heap of broken stone
      for (const [x, y, s] of [[1, 4, 3], [4, 2, 3], [6, 5, 3], [3, 6, 2]].map(([x, y, s]) => [x + (v === 1 ? 1 : 0), y, s])) { c.fillStyle = INK; c.fillRect(x - 1, y - 1, s + 2, s + 1); }
      for (const [x, y, s] of [[1, 4, 3], [4, 2, 3], [6, 5, 3], [3, 6, 2]].map(([x, y, s]) => [x + (v === 1 ? 1 : 0), y, s])) { c.fillStyle = ST[3]; c.fillRect(x, y, s, s - 1); c.fillStyle = ST[5]; c.fillRect(x, y - 1 + 1, s - 1, 1); c.fillStyle = ST[2]; c.fillRect(x + s - 1, y, 1, s - 1); }
      if (v === 2) { c.fillStyle = WOOD[2]; c.fillRect(2, 7, 4, 1); }
    }
  });
  ctx.drawImage(spr, Math.round(p.x) - 5, Math.round(p.y) - 5);
}

export default {
  n: 5, id: 'wall', name: 'THE CITY WALL', sub: 'THEY PULLED UP THE BRIDGE.', mode: 'timed',
  kinds,
  build(g, rng, P) { return build(g, rng, P); },
  update, hud,
  art: {
    ground, under,
    props: {
      wl_cottage: drawBuilding, wl_house: drawBuilding, wl_barn: drawBuilding, wl_watch: drawBuilding,
      wl_cart: drawCart, wl_stall: drawStall, wl_stones: drawRubble, wl_timber: drawRubble, wl_block: drawRubble,
    },
    canopy: false, theme: { leash: false },
  },
};
