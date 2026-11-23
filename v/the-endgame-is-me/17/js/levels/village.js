// Level 4, the Villages: a road through three little crossroads villages. Thatched cottages, a wooden inn on every
// crossroads, a well in the cobbled square, market stalls, barrels, cabbage gardens, villagers who run, and carts and
// loose horses that bolt off the map the moment you come near (catch them first and they pay). Scores like the
// Low Wood: knock a building flat for half, burn the wreck for the rest, or burn it standing for all of it.

import { scatter } from './forest.js';
import { Occupancy, fenceRing, paint, mapSprite, blit, paintHouse, paintRuin, shadow, INK, THATCH, SHINGLE, PLANK, DAUB } from './farms.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------------------------------------- kinds

const BUILDING = { solid: true, flammable: true, spread: 0.3 };
const SMALL = { flammable: true, burnTime: 4, spread: 0.3 };
export const kinds = {
  cottage: { ...BUILDING, w: 20, h: 12, hp: 160, burnTime: 9, leaves: '#c4a858', value: { pts: 200, venge: 0.16, chaos: 1.8 } },
  inn: { ...BUILDING, w: 32, h: 18, hp: 360, burnTime: 13, leaves: '#8a5a36', value: { pts: 450, venge: 0.3, chaos: 3.5 } },
  well: { ...BUILDING, r: 4, hp: 140, burnTime: 5, spread: 0.1, leaves: '#aeac9b', value: { pts: 120, venge: 0.1, chaos: 0.6 } },
  stall: { ...SMALL, w: 12, h: 6, slow: 0.3, slowR: 7, leaves: '#d8473a', value: { pts: 40, venge: 0.04, chaos: 0.35 } },
  barrel: { ...SMALL, r: 2, leaves: '#8a5a36', value: { pts: 15, venge: 0.01, chaos: 0.1 } },
  crate: { ...SMALL, r: 2, leaves: '#b08a5a', value: { pts: 15, venge: 0.01, chaos: 0.1 } },
};

export const critters = {
  cart: { r: 4, hp: 60, spd: 2, flee: 24, fear: 55, leaves: true, bits: '#8a5a36', cry: 'neigh', value: { pts: 300, venge: 0.15, chaos: 0.6 } },
  horse: { r: 3, hp: 45, spd: 5, flee: 30, fear: 50, leaves: true, bits: 'blood', cry: 'neigh', value: { pts: 250, venge: 0.12, chaos: 0.5 } },
  villager: { r: 1.5, hp: 15, spd: 7, flee: 20, fear: 40, raise: 'skeleton', value: { pts: 80, venge: 0.06, chaos: 0.2 } },
};

// ---------------------------------------------------------------------------------------------- layout

const roadY = x => 96 + Math.sin(x / 140) * 9 + Math.sin(x / 47) * 2;
const VILLAGES = [230, 615, 1000];
const lane = (cx, y) => cx + Math.sin(y / 23 + cx) * 3;    // the north-south road through a village

function build(g, rng, P) {
  const w = 1200, h = 180, start = { x: 36, y: Math.round(roadY(36)), face: 0 };
  const occ = Occupancy(), gardens = [], squares = [], greens = [];
  g.lvlCarts = new Map();
  occ.take(start.x - 26, start.y - 20, start.x + 30, start.y + 20, 'start');
  for (let x = 0; x < w; x += 8) occ.take(x, roadY(x + 4) - 8, x + 8, roadY(x + 4) + 8, 'road');
  for (const cx of VILLAGES) for (let y = 0; y < h; y += 8) occ.take(lane(cx, y + 4) - 8, y, lane(cx, y + 4) + 8, y + 8, 'road');
  const tryPlace = (kind, x0, y0, x1, y1, pad, n = 40) => {
    const d = P.KINDS[kind], hw = (d.w || d.r * 2) / 2, hh = (d.h || d.r * 2) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
      if (x - hw < 6 || x + hw > w - 6 || y - hh < 22 || y + hh > 158) continue;
      // a building's roof stands up above its footprint: keep that clear too
      const up = kind === 'inn' ? 12 : kind === 'cottage' ? 8 : 2;
      if (!occ.free(x - hw, y - hh - up, x + hw, y + hh, pad)) continue;
      occ.take(x - hw, y - hh - up, x + hw, y + hh, kind);
      return P.addProp(g, kind, x, y);
    }
    return null;
  };

  VILLAGES.forEach((cx, vi) => {
    const cy = roadY(cx);
    // the cobbled square and its well
    squares.push({ x: cx, y: cy, rx: 26, ry: 16 });
    greens.push({ x: cx, y: cy, rx: 105, ry: 62 });
    P.addProp(g, 'well', cx + 12, cy - 9);
    occ.take(cx + 6, cy - 16, cx + 18, cy - 4, 'well');
    // the inn takes one corner of the crossroads, cottages fill the rest
    const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const innQ = Math.floor(rng() * 4);
    quads.forEach(([sx, sy], qi) => {
      const near = sx < 0 ? [cx - 46, cx - 22] : [cx + 22, cx + 46];
      const ny = sy < 0 ? [cy - 34, cy - 22] : [cy + 22, cy + 34];
      if (qi === innQ) {
        const inn = tryPlace('inn', near[0], ny[0], near[1], ny[1], 3, 80);
        if (inn) {
          for (let k = 0; k < 4; k++) tryPlace(rng() < 0.6 ? 'barrel' : 'crate', inn.x + sx * 20 - 5, inn.y - 6, inn.x + sx * 20 + 5, inn.y + 12, 1);
          P.addCritter(g, 'horse', inn.x - sx * 4, inn.y + sy * 16);
        }
      }
      for (let k = 0; k < 2; k++) {
        const fx = sx < 0 ? [cx - 100, cx - 22] : [cx + 22, cx + 100], fy = sy < 0 ? [cy - 70, cy - 20] : [cy + 20, cy + 60];
        const c = tryPlace('cottage', fx[0], fy[0], fx[1], fy[1], 4);
        // a cabbage patch behind some of them
        if (c && rng() < 0.55) {
          const gx0 = c.x - 12 + (rng() - 0.5) * 8, gy0 = sy < 0 ? c.y - 36 : c.y + 15, gd = { x0: gx0, y0: gy0, x1: gx0 + 24, y1: gy0 + 16 };
          if (gd.y0 > 20 && gd.y1 < 158 && occ.free(gd.x0, gd.y0, gd.x1, gd.y1, 2)) {
            occ.take(gd.x0 - 1, gd.y0 - 1, gd.x1 + 1, gd.y1 + 1, 'garden');
            gardens.push(gd);
            for (let yy = gd.y0 + 4; yy <= gd.y1 - 3; yy += 6) for (let xx = gd.x0 + 4; xx <= gd.x1 - 3; xx += 6) P.addProp(g, 'cabbage', xx + (rng() - 0.5), yy + (rng() - 0.5));
            fenceRing(g, P, gd.x0 - 2, gd.y0 - 2, gd.x1 + 2, gd.y1 + 2, sy < 0 ? 'b' : 't');
          }
        }
      }
    });
    // market stalls round the square
    for (let k = 0; k < 3; k++) {
      const sx = k === 0 ? -1 : 1, x = cx + sx * (20 + rng() * 14), y = cy + (k === 2 ? 16 : -16) + (rng() - 0.5) * 4;
      if (occ.free(x - 7, y - 5, x + 7, y + 4)) { occ.take(x - 7, y - 5, x + 7, y + 4, 'stall'); P.addProp(g, 'stall', x, y); }
    }
    // carts parked on the roads, villagers in the square, a few hens
    P.addCritter(g, 'cart', cx - 60 - rng() * 20, roadY(cx - 70) + 1);
    P.addCritter(g, 'cart', lane(cx, cy + 45) + 1, cy + 45 + rng() * 10);
    if (vi !== 1) P.addCritter(g, 'cart', cx + 70 + rng() * 20, roadY(cx + 80) - 1);
    for (let k = 0; k < 6; k++) P.addCritter(g, 'villager', cx + (rng() - 0.5) * 50, cy + (rng() - 0.5) * 24);
    for (let k = 0; k < 3; k++) P.addCritter(g, 'chicken', cx + (rng() < 0.5 ? -1 : 1) * (30 + rng() * 40), cy + (rng() < 0.5 ? -1 : 1) * (14 + rng() * 10));
    // haystacks out at the edge of the village
    for (let k = 0; k < 2; k++) tryPlace('hay', cx - 110 + rng() * 220, 24, cx - 110 + rng() * 220, 156, 3);
  });
  // a loose horse or two on the road between villages
  P.addCritter(g, 'horse', 420, roadY(420) + 12);
  P.addCritter(g, 'horse', 810, roadY(810) - 12);
  // trees and hedges in the gaps
  const avoid = occ.rects.filter(r => r.tag !== 'road').map(r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 + 5 }));
  for (const t of scatter(rng, 70, 10, 22, w - 10, h - 22, 16, avoid)) {
    if (occ.inside(t.x, t.y, 4)) continue;
    const inVillage = VILLAGES.some(cx => Math.abs(t.x - cx) < 70);
    P.addProp(g, inVillage ? 'bush' : rng() < 0.5 ? 'oak' : rng() < 0.5 ? 'pine' : 'bush', t.x, t.y);
  }
  return { w, h, scroll: 'x', start, gardens, squares, greens };
}

// carts that are smashed (rather than driven off the map) leave a wreck behind
function update(g) {
  const seen = (g.lvlCarts ||= new Map());
  for (const c of g.critters) if (c.kind === 'cart' || c.kind === 'horse') seen.set(c.id, c);
  for (const [id, c] of seen) {
    if (!c.dead && !c.gone) continue;
    seen.delete(id);
    if (c.dead) g.corpses.push({ u: null, critter: c.kind, x: c.x, y: c.y, cls: null, t: 0, fx: c.fx });
  }
}

// ---------------------------------------------------------------------------------------------- art

const BT = k => kinds[k]?.burnTime || 8;
const THATCH2 = ['#3e2e14', '#644c22', '#8a6c30', '#ae9040', '#d0b45c'];
const DAUB2 = ['#6a5e48', '#9c8c6c', '#bcac88', '#d4c6a0', '#e6dab8'];

function drawCottage(ctx, p, g, h) {
  const v = p.seed % 4, W = p.w + 2, RH = 11, WH = 7, H = RH + WH;
  const x0 = Math.round(p.x) - (W >> 1), base = Math.round(p.y + p.h / 2);
  if (p.state === 'up') {
    const spr = h.sprite(`vl-cot${v}`, W, H, c => paintHouse(c, { W, RH, WH, roof: 'thatch', roofPal: v & 1 ? THATCH2 : THATCH, wall: 'timber', wallPal: v > 1 ? DAUB2 : DAUB,
      posts: [7, W - 8], doors: [{ x: v & 2 ? 4 : W - 9, w: 3, h: 5, kind: 'plain' }], windows: [{ x: v & 2 ? W - 7 : 4, y: 2, w: 2, h: 2 }, { x: v & 2 ? 10 : 9, y: 2, w: 2, h: 2 }],
      chimney: v === 3 ? null : v & 1 ? 4 : W - 6, seed: v * 7 + 1, lit: v === 1 }, h.hash));
    shadow(ctx, x0 + 3, base - WH, W, WH + 2);
    blit(ctx, spr, x0, base - H + 1, p, h, BT('cottage'));
    if (!p.burning && v !== 3) smoke(ctx, g, x0 + (v & 1 ? 4 : W - 6), base - H, p.seed);
  } else {
    const Hh = p.h + 4, spr = h.sprite(`vl-cotx${v}`, W, Hh, c => paintRuin(c, W, Hh, v & 1 ? THATCH2 : THATCH, DAUB, v * 3 + 9, h.hash, true));
    blit(ctx, spr, x0, base - Hh + 1, p, h, BT('cottage'));
  }
}

function smoke(ctx, g, x, y, seed) {
  const t = Math.floor(g.t * 2 + seed) % 7;
  ctx.globalAlpha = 0.4; ctx.fillStyle = '#b8b0a0';
  ctx.fillRect(x + (t > 3 ? 1 : 0), y - 1 - t, 1, 1);
  if (t > 1) ctx.fillRect(x + 1 - (t > 5 ? 1 : 0), y - 3 - t, 1, 1);
  ctx.globalAlpha = 1;
}

function drawInn(ctx, p, g, h) {
  const v = p.seed % 2, W = p.w + 2, RH = 14, WH = 13, H = RH + WH;
  const x0 = Math.round(p.x) - (W >> 1), base = Math.round(p.y + p.h / 2);
  if (p.state === 'up') {
    const spr = h.sprite(`vl-inn${v}`, W, H, c => {
      paintHouse(c, { W, RH, WH, roof: 'shingle', roofPal: v ? SHINGLE : ['#2a1c18', '#4a2e26', '#643c30', '#7c4c3a', '#985e46'], wall: 'plank',
        doors: [{ x: (W >> 1) - 2, w: 5, h: 6, kind: 'plain' }],
        windows: [{ x: 4, y: 2, w: 3, h: 2 }, { x: 10, y: 2, w: 3, h: 2 }, { x: W - 13, y: 2, w: 3, h: 2 }, { x: W - 7, y: 2, w: 3, h: 2 }, { x: 5, y: 8, w: 3, h: 2 }, { x: W - 8, y: 8, w: 3, h: 2 }],
        chimney: v ? 5 : W - 7, seed: 5 + v, lit: true, hip: 0.6 }, h.hash);
      // a beam between the floors, and the sign on its bracket
      c.fillStyle = PLANK[0]; c.fillRect(1, RH + 6, W - 2, 1);
      const sx = (W >> 1) + 5, sy = RH + 6;
      c.fillStyle = INK; c.fillRect(sx, sy, 5, 1); c.fillRect(sx + 1, sy + 1, 5, 4);
      c.fillStyle = PLANK[3]; c.fillRect(sx + 2, sy + 2, 3, 2);
      c.fillStyle = '#ffd75a'; c.fillRect(sx + 3, sy + 2, 1, 2);
    });
    shadow(ctx, x0 + 4, base - WH, W, WH + 3);
    blit(ctx, spr, x0, base - H + 1, p, h, BT('inn'));
    if (!p.burning) smoke(ctx, g, x0 + (v ? 5 : W - 7), base - H, p.seed);
  } else {
    const Hh = p.h + 5, spr = h.sprite(`vl-innx${v}`, W, Hh, c => paintRuin(c, W, Hh, v ? SHINGLE : ['#2a1c18', '#4a2e26', '#643c30', '#7c4c3a', '#985e46'], PLANK, v * 5 + 21, h.hash));
    blit(ctx, spr, x0, base - Hh + 1, p, h, BT('inn'));
  }
}

const STONE = ['#2f302c', '#55564f', '#7f7f74', '#aeac9b', '#d2cfbd'];
function drawWell(ctx, p, g, h) {
  const x = Math.round(p.x), y = Math.round(p.y);
  if (p.state === 'up') {
    const spr = h.sprite('vl-well', 13, 16, c => {
      // stone drum
      paint(c, 13, 16, (px, py) => {
        const dx = px - 6, yy = py - 8;
        if (yy < 0) return null;
        const inTop = (dx / 5.5) ** 2 + ((yy - 1.5) / 2.2) ** 2 < 1, inBody = Math.abs(dx) < 5.5 && yy >= 1.5 && yy <= 5 || (dx / 5.5) ** 2 + ((yy - 5) / 2.2) ** 2 < 1;
        if (!inTop && !inBody) return null;
        if (inTop && (dx / 3.8) ** 2 + ((yy - 1.5) / 1.3) ** 2 < 1) return '#0e1418';   // the dark water down the shaft
        if (inTop && yy < 2.5) return STONE[3];
        const brick = ((px + (py & 1) * 2) % 4 === 0) || py % 2 === 0;
        return STONE[clamp(Math.round(2.6 - dx / 5.5 + (brick ? -1 : 0)), 1, 4)];
      });
      // posts, a little roof and the bucket rope
      c.fillStyle = INK; c.fillRect(0, 4, 2, 7); c.fillRect(11, 4, 2, 7);
      c.fillStyle = PLANK[3]; c.fillRect(0, 5, 1, 5); c.fillRect(11, 5, 1, 5);
      paint(c, 13, 6, (px, py) => py < 5 && Math.abs(px - 6) <= 2 + py ? (py === 4 ? SHINGLE[0] : SHINGLE[clamp(4 - (px > 6 ? 1 : 0) - (py > 2 ? 1 : 0), 1, 4)]) : null);
      c.fillStyle = PLANK[1]; c.fillRect(1, 6, 11, 1);
      c.fillStyle = '#c8b48a'; c.fillRect(6, 7, 1, 3);
    });
    shadow(ctx, x - 3, y + 1, 11, 3);
    blit(ctx, spr, x - 6, y - 12, p, h, BT('well'));
  } else {
    const spr = h.sprite('vl-wellx', 15, 10, c => {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU; if (h.hash(i, 3) < 0.3) continue;
        const px = Math.round(7 + Math.cos(a) * 5.5), py = Math.round(5 + Math.sin(a) * 3);
        c.fillStyle = INK; c.fillRect(px, py, 2, 2); c.fillStyle = STONE[2 + (i & 1)]; c.fillRect(px, py, 1, 1);
      }
      c.fillStyle = '#0e1418'; c.fillRect(5, 4, 5, 2);
      for (let k = 0; k < 3; k++) { c.fillStyle = INK; c.fillRect(2 + k * 4, 7 - k, 4, 2); c.fillStyle = PLANK[3]; c.fillRect(2 + k * 4, 7 - k, 3, 1); }
    });
    blit(ctx, spr, x - 7, y - 5, p, h, BT('well'));
  }
}

// a market stall: a striped awning over a counter of goods
const AWN = [['#d8473a', '#f4ecd2'], ['#3a6ab0', '#f4ecd2'], ['#4a8a3a', '#e8d23a']];
const GOODS = ['#d8473a', '#e8b83a', '#6e9a44', '#c8a064', '#a463e0'];
function drawStall(ctx, p, g, h) {
  const x = Math.round(p.x), y = Math.round(p.y), v = p.seed % 3, [a, b] = AWN[v];
  if (p.state === 'up') {
    const spr = h.sprite(`vl-stall${v}`, 15, 12, c => {
      // the counter and its goods
      c.fillStyle = INK; c.fillRect(1, 6, 13, 6);
      c.fillStyle = PLANK[3]; c.fillRect(2, 9, 11, 2);
      c.fillStyle = PLANK[1]; c.fillRect(2, 10, 11, 1);
      for (let i = 0; i < 10; i++) { c.fillStyle = GOODS[(i * 3 + v) % 5]; c.fillRect(2 + i + (i > 4 ? 1 : 0), 7 + (i & 1), 1, 1); }
      c.fillStyle = PLANK[0]; c.fillRect(2, 7, 1, 2); c.fillRect(12, 7, 1, 2);
      // the awning, scalloped along the front
      paint(c, 15, 8, (px, py) => {
        if (px < 0 || px > 14 || py > 6) return null;
        if (py === 6 && (px & 1)) return null;
        if (py === 0 && (px === 0 || px === 14)) return null;
        const stripe = Math.floor(px / 2) & 1;
        const dark = py >= 5;
        return stripe ? (dark ? '#b8ac94' : b) : (dark ? '#8a2a22' : a);
      });
    });
    shadow(ctx, x - 5, y + 2, 13, 2);
    blit(ctx, spr, x - 7, y - 8, p, h, BT('stall'));
  } else {
    const spr = h.sprite(`vl-stallx${v}`, 15, 9, c => {
      paint(c, 15, 9, (px, py) => {
        const d = Math.hypot((px - 7) / 6.5, (py - 4) / 3.5) + (h.hash(px, py + v) - 0.5) * 0.4;
        if (d > 1) return null;
        return (Math.floor((px + py) / 2) & 1) ? (d > 0.7 ? '#9a8e78' : b) : (d > 0.7 ? '#7a2420' : a);
      });
      for (let i = 0; i < 7; i++) { c.fillStyle = GOODS[(i + v) % 5]; c.fillRect(Math.floor(h.hash(i, v + 2) * 15), 6 + (i % 3), 1, 1); }
    });
    blit(ctx, spr, x - 7, y - 4, p, h, BT('stall'));
  }
}

function drawBarrel(ctx, p, g, h) {
  const x = Math.round(p.x), y = Math.round(p.y), crate = p.kind === 'crate';
  if (p.state === 'up') {
    const spr = crate ? h.sprite('vl-crate', 7, 7, c => {
      c.fillStyle = INK; c.fillRect(0, 0, 7, 7);
      c.fillStyle = '#c8a46c'; c.fillRect(1, 1, 5, 2);
      c.fillStyle = '#a07a48'; c.fillRect(1, 3, 5, 3);
      c.fillStyle = '#7a5a34'; c.fillRect(1, 4, 5, 1); c.fillRect(3, 3, 1, 3);
      c.fillStyle = '#e0c48c'; c.fillRect(1, 1, 2, 1);
    }) : h.sprite('vl-barrel', 7, 8, c => paint(c, 7, 8, (px, py) => {
      const dx = px - 3;
      if (Math.abs(dx) > (py === 0 || py === 7 ? 2 : 3)) return null;
      if (py <= 1) return py === 0 ? '#5e3b24' : (dx < 0 ? '#a06a43' : '#835233');
      if (py === 3 || py === 6) return '#3a3430';
      return PLANK[clamp(3 - (dx > 0 ? 1 : 0) - (dx > 1 ? 1 : 0) + (dx < -1 ? 1 : 0), 1, 4)];
    }));
    shadow(ctx, x - 1, y + 2, 5, 1);
    blit(ctx, spr, x - 3, y - spr.height + 3, p, h, BT('barrel'));
  } else {
    const spr = h.sprite(`vl-${p.kind}x`, 9, 6, c => {
      for (let i = 0; i < 6; i++) { const px = Math.floor(h.hash(i, crate ? 1 : 2) * 8), py = Math.floor(h.hash(crate ? 3 : 4, i) * 4); c.fillStyle = INK; c.fillRect(px, py + 1, 2, 1); c.fillStyle = crate ? '#b08a5a' : PLANK[3]; c.fillRect(px, py, 2, 1); }
      if (!crate) { c.fillStyle = '#3a3430'; c.fillRect(3, 2, 3, 1); }
    });
    blit(ctx, spr, x - 4, y - 3, p, h, BT('barrel'));
  }
}

// ---------------------------------------------------------------------------------------------- animals and people

const HORSE_PAL = { H: '#7a5236', h: '#5a3d29', m: '#1a120c', d: '#3a281b', L: '#3a281b', t: '#1a120c', e: INK };
const HORSE_PAL2 = { ...HORSE_PAL, H: '#c8b8a0', h: '#9a8a74', L: '#6a5e50' };
const HORSE = [
  ['......mm..', 't.....mHH.', 'tHHHHHHHed', '.hHHHHh...', '.L.L..L.L.', '.L.L..L.L.'],
  ['......mm..', 't.....mHH.', 'tHHHHHHHed', '.hHHHHh...', '..L.L..L.L', '.L..L.L..L'],
];
// the cart rides behind its horse; loads vary
const CART_PAL = { ...HORSE_PAL, P: '#74492c', p: '#4a2e1c', W: '#2a1c12', w: '#a08a6a', S: '#c8b48a', s: '#a08a64', Y: '#d8c068', y: '#b49c48', B: '#835233', b: '#5e3b24', '-': '#4a2e1c' };
const CART_LOADS = [['.SsSs..', 'SsSsSs.'], ['.YyYY..', 'YYyYyY.'], ['.Bb.Bb.', 'BbBbBb.']];
function cartRows(load, fr) {
  const hr = HORSE[fr];
  const cart = [load[0], load[1], 'PPPPPPP', 'pPPPPPp', '.WwW...', '..W....'];
  return hr.map((r, i) => cart[i].padEnd(7, '.') + (i === 3 ? '-' : '.') + r);
}
function drawHorse(ctx, c, g, h) {
  const x = Math.round(c.x), y = Math.round(c.y), fr = c.moving ? Math.floor(c.walk * 1.5) % 2 : 0;
  const pal = c.seed % 3 === 0 ? HORSE_PAL2 : HORSE_PAL, spr = mapSprite(h, `vl-horse${c.seed % 3 === 0 ? 'g' : 'b'}${fr}`, HORSE[fr], pal, c.fx < 0);
  shadow(ctx, x - 4, y + 1, 9, 1, 0.35);
  const X = x - (spr.width >> 1), Y = y - spr.height + 2 - (c.moving && fr ? 1 : 0);
  ctx.drawImage(spr, X, Y);
  if (c.hitT > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(h.tinted(spr, '#ffffff'), X, Y); ctx.globalAlpha = 1; }
}
function drawCart(ctx, c, g, h) {
  const x = Math.round(c.x), y = Math.round(c.y), fr = c.moving ? Math.floor(c.walk * 1.5) % 2 : 0, ld = c.seed % 3;
  const spr = mapSprite(h, `vl-cart${ld}${fr}`, cartRows(CART_LOADS[ld], fr), CART_PAL, c.fx < 0);
  shadow(ctx, x - 8, y + 1, 17, 1, 0.35);
  const X = x - (spr.width >> 1), Y = y - spr.height + 2 - (c.moving && fr ? 1 : 0);
  ctx.drawImage(spr, X, Y);
  if (c.hitT > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(h.tinted(spr, '#ffffff'), X, Y); ctx.globalAlpha = 1; }
}

// villagers: drawn like the heroes (three pixels wide), in drab tunics; they wave their arms when they run
const TUNIC = ['#7a6a4a', '#5a6a3a', '#8a5a3a', '#6a5a7a', '#9a8a6a', '#4a5a6a'];
const HAIR = ['#2a1d14', '#6e4a2a', '#c8a064', '#3a2a1a', '#8a8a80'];
function drawVillager(ctx, c, g, h) {
  const x = Math.round(c.x), y = Math.round(c.y), flash = c.hitT > 0, C = col => flash ? '#ffffff' : col;
  const run = c.scared > 0 || Math.hypot(g.boss.x - c.x, g.boss.y - c.y) < 40;
  const st = c.moving ? Math.floor(c.walk * (run ? 2 : 1)) % 2 : 2;
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(x - 1, y + 1, 3, 1);
  if (st !== 0) h.px(ctx, x - 1, y, C(INK));
  if (st !== 1) h.px(ctx, x + 1, y, C(INK));
  ctx.fillStyle = C(TUNIC[c.seed % 6]); ctx.fillRect(x - 1, y - 2, 3, 2);
  h.px(ctx, x, y - 3, C('#e8b48a'));
  h.px(ctx, x - c.fx, y - 3, C(HAIR[c.seed % 5]));
  if (c.seed % 4 === 0) h.px(ctx, x, y - 4, C(HAIR[c.seed % 5]));
  if (run) { const k = Math.floor(g.t * 8 + c.seed) % 2; h.px(ctx, x - 2, y - 3 - k, C('#e8b48a')); h.px(ctx, x + 2, y - 4 + k, C('#e8b48a')); }
  else if (c.seed % 3 === 0) h.px(ctx, x + c.fx * 2, y - 2, C(c.seed % 2 ? '#c8a064' : '#8a5a36'));   // a basket or a tool
}

const HORSE_DEAD = ['.L.L.L.L..', '.L.L.L.L..', 'tHHHHHHHH.', '.hHHHHhHed', '..rr.rrr..'];
const CART_WRECK = ['..S.s..Y.', '.PPp.sPP.', 'P.pPP.pPw', '.W.PP.W..', 'rWw...Ww.'];
const DEAD_PAL = { ...CART_PAL, r: '#a3201a' };
function corpse(key, rows) {
  return (ctx, c, h) => {
    const spr = mapSprite(h, key, rows, DEAD_PAL, c.fx < 0);
    ctx.drawImage(spr, Math.round(c.x) - (spr.width >> 1), Math.round(c.y) - spr.height + 3);
  };
}
const cartCorpse = corpse('vl-cartd', CART_WRECK), horseCorpse = corpse('vl-horsed', HORSE_DEAD);
function drawVillagerCorpse(ctx, c, h) {
  const x = Math.round(c.x), y = Math.round(c.y);
  ctx.fillStyle = TUNIC[(c.x * 7 | 0) % 6]; ctx.fillRect(x - 1, y - 1, 3, 1);
  h.px(ctx, x + 2, y - 1, '#e8b48a'); h.px(ctx, x, y, '#a3201a'); h.px(ctx, x - 1, y, '#a3201a');
}

// ---------------------------------------------------------------------------------------------- ground

const GRASS = ['#30462a', '#384f2e', '#415a34', '#4c663a'];
function ground(ctx, m, h) {
  const { hash, vnoise } = h;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const n = vnoise(x / 28, y / 28) * 0.55 + vnoise(x / 9 + 70, y / 9) * 0.3 + hash(x, y) * 0.2;
    ctx.fillStyle = GRASS[clamp(Math.floor(n * 3.4 - 0.2 + ((x + y) & 1) * 0.3), 0, 3)]; ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < m.w * 2; i++) {
    const x = Math.floor(hash(i, 19) * m.w), y = Math.floor(hash(i, 29) * m.h), k = hash(i, 7);
    ctx.fillStyle = k < 0.05 ? '#e8d23a' : k < 0.09 ? '#f4ecd2' : k < 0.12 ? '#9fb8ff' : k < 0.6 ? '#5a7a3c' : '#2a3c22';
    ctx.fillRect(x, y, 1, 1);
  }
  // the village greens are worn thin round the houses
  for (const gr of m.greens || []) for (let y = Math.max(0, Math.floor(gr.y - gr.ry)); y <= Math.min(m.h - 1, gr.y + gr.ry); y++) for (let x = Math.floor(gr.x - gr.rx); x <= gr.x + gr.rx; x++) {
    const d = ((x - gr.x) / gr.rx) ** 2 + ((y - gr.y) / gr.ry) ** 2 + (vnoise(x / 7, y / 7) - 0.5) * 0.6;
    if (d > 1 || hash(x * 5, y * 3) > 0.45 - d * 0.3) continue;
    ctx.fillStyle = hash(y, x) < 0.5 ? '#4a4a2c' : '#55502e'; ctx.fillRect(x, y, 1, 1);
  }
  // roads: packed dirt with wheel ruts and a ragged grassy edge
  const road = (x, y, d, half) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
    const k = hash(x * 3, y * 7);
    if (Math.abs(d) > half - 1 && k < 0.45) return;
    let col = k < 0.3 ? '#5a4a32' : k < 0.8 ? '#665438' : '#74603f';
    if (Math.abs(Math.abs(d) - 2.5) < 0.6) col = k < 0.5 ? '#4a3a26' : '#54422c';
    if (k > 0.97) col = '#8a8a7a';
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  };
  for (let x = 0; x < m.w; x++) { const cy = roadY(x); for (let dy = -6; dy <= 6; dy++) road(x, Math.round(cy + dy), dy, 6); }
  for (const cx of VILLAGES) for (let y = 0; y < m.h; y++) { const lx = lane(cx, y); for (let dx = -5; dx <= 5; dx++) road(Math.round(lx + dx), y, dx, 5); }
  // cobbled squares at the crossroads
  for (const s of m.squares || []) for (let y = Math.floor(s.y - s.ry); y <= s.y + s.ry; y++) for (let x = Math.floor(s.x - s.rx); x <= s.x + s.rx; x++) {
    const d = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 + (hash(x, y) - 0.5) * 0.15;
    if (d > 1) continue;
    const bx = Math.floor((x + (Math.floor(y / 2) & 1) * 2) / 3), by = Math.floor(y / 2);
    const seam = (x + (Math.floor(y / 2) & 1) * 2) % 3 === 0 || y % 2 === 0;
    const k = hash(bx, by);
    const lit = !seam && (x + (Math.floor(y / 2) & 1) * 2) % 3 === 1 && y % 2 === 1;   // the top-left of each cobble catches the light
    ctx.fillStyle = seam ? (d > 0.75 ? '#55463a' : '#4a443a') : k < 0.3 ? '#6e685a' : k < 0.75 ? '#7a7464' : k < 0.95 ? '#857e6c' : '#6a5a42';
    if (lit && k > 0.3) ctx.fillStyle = '#958e7a';
    if (d > 0.8 && hash(y, x) < 0.4) ctx.fillStyle = '#665438';
    ctx.fillRect(x, y, 1, 1);
  }
  // gardens are dug over
  for (const gd of m.gardens || []) for (let y = Math.floor(gd.y0); y <= gd.y1; y++) for (let x = Math.floor(gd.x0); x <= gd.x1; x++) {
    const row = (y - Math.floor(gd.y0)) % 3, k = hash(x * 7, y * 3);
    ctx.fillStyle = row === 0 ? '#3a2a1a' : k < 0.5 ? '#5a4228' : '#4c3822'; ctx.fillRect(x, y, 1, 1);
  }
}

export default {
  n: 4, id: 'village', name: 'THE VILLAGES', sub: 'FLATTEN THE COTTAGES. TORCH THE INNS. THE CARTS WILL RUN.', mode: 'chaos',
  kinds, critters,
  build(g, rng, P) { return build(g, rng, P); },
  update,
  art: {
    ground,
    props: { cottage: drawCottage, inn: drawInn, well: drawWell, stall: drawStall, barrel: drawBarrel, crate: drawBarrel },
    critters: { cart: drawCart, horse: drawHorse, villager: drawVillager },
    corpses: { cart: cartCorpse, horse: horseCorpse, villager: drawVillagerCorpse },
    canopy: false, theme: { leash: false },
  },
};
