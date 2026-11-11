// Level 2, the Low Wood: a thin forest that scrolls sideways. Trees slow the heroes down; walk through them and they
// fall and break, set them alight and they burn (and set their neighbours going). Every tree feeds Vengeance and Chaos.

const TAU = Math.PI * 2;

const TREE = { flammable: true, burnTime: 7, spread: 0.25, crushShare: 0.5 };
export const kinds = {
  pine: { ...TREE, r: 3, slow: 0.45, slowR: 9, leaves: 'needle', value: { pts: 120, venge: 0.12, chaos: 1 } },
  oak: { ...TREE, r: 4, slow: 0.45, slowR: 10, burnTime: 8, leaves: 'leaf', value: { pts: 150, venge: 0.14, chaos: 1.2 } },
  bush: { ...TREE, r: 2, slow: 0.25, slowR: 5, burnTime: 3, leaves: 'leaf', value: { pts: 30, venge: 0.04, chaos: 0.25 } },
};

// scatters things with a minimum spacing: tries a lot of random spots and keeps the ones with room
export function scatter(rng, n, x0, y0, x1, y1, gap, avoid = []) {
  const out = [];
  for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
    if (avoid.some(a => Math.hypot(a.x - x, a.y - y) < a.r)) continue;
    if (out.some(p => Math.hypot(p.x - x, p.y - y) < gap)) continue;
    out.push({ x, y });
  }
  return out;
}

function build(g, rng, P) {
  const w = 960, h = 180, start = { x: 46, y: 98, face: 0 };
  const glade = [{ x: start.x, y: start.y, r: 40 }];
  // a few clumps and glades so it isn't an even carpet
  for (let i = 0; i < 5; i++) glade.push({ x: 160 + rng() * 760, y: 40 + rng() * 110, r: 18 + rng() * 14 });
  const trees = scatter(rng, 125, 12, 22, w - 12, h - 22, 13, glade);
  for (const t of trees) P.addProp(g, rng() < 0.6 ? 'pine' : 'oak', t.x, t.y);
  for (const t of scatter(rng, 70, 12, 22, w - 12, h - 22, 7, glade.slice(0, 1).concat(trees.map(t => ({ ...t, r: 6 }))))) P.addProp(g, 'bush', t.x, t.y);
  return { w, h, scroll: 'x', start };
}

// ---------------------------------------------------------------------------------------------- art

const GROUND = { a: '#22301b', b: '#2a3a20', c: '#334526', d: '#3e5230', litter: ['#5a4a2a', '#6e5a32', '#4a3a22', '#7a6a3a'], moss: '#4e6a2e', trail: ['#4a3d29', '#5a4a32'] };

function ground(ctx, m, h) {
  const { hash, vnoise } = h;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const n = vnoise(x / 26, y / 26) * 0.55 + vnoise(x / 8 + 30, y / 8) * 0.3 + hash(x, y) * 0.2;
    const lvl = Math.floor(n * 3.4 - 0.3 + ((x + y) & 1) * 0.3);
    ctx.fillStyle = lvl <= 0 ? GROUND.a : lvl === 1 ? GROUND.b : lvl === 2 ? GROUND.c : GROUND.d;
    ctx.fillRect(x, y, 1, 1);
  }
  // deer trails winding through
  for (let k = 0; k < 2; k++) {
    const y0 = 60 + k * 60, ph = k * 2.1;
    for (let x = 0; x < m.w; x++) {
      const cy = y0 + Math.sin(x / 70 + ph) * 18 + Math.sin(x / 23) * 4;
      for (let dy = -2; dy <= 2; dy++) if (hash(x, Math.round(cy) + dy + k * 99) < 0.75 - Math.abs(dy) * 0.15) { ctx.fillStyle = GROUND.trail[(x + dy) & 1]; ctx.fillRect(x, Math.round(cy) + dy, 1, 1); }
    }
  }
  // leaf litter and moss
  for (let i = 0; i < m.w * 3; i++) {
    const x = Math.floor(hash(i, 7) * m.w), y = Math.floor(hash(i, 13) * m.h);
    ctx.fillStyle = hash(i, 3) < 0.2 ? GROUND.moss : GROUND.litter[i & 3];
    ctx.fillRect(x, y, 1, 1);
  }
}

// a canopy seen from above: a lumpy disc, lit from the top left, with an ink edge
export function canopy(ctx, cx, cy, R, cols, seed, hash, lumps = 7) {
  const inside = (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
    const j = (hash(Math.round((a + 4) * lumps) + seed, seed) - 0.5) * R * 0.35;
    return Math.hypot(dx, dy) < R + j;
  };
  for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const l = (-(x - cx) * 0.6 - (y - cy) * 0.8) / R + (hash(x * 3 + seed, y * 5) - 0.5) * 0.55;
    ctx.fillStyle = edge ? '#0e140c' : l > 0.55 ? cols[3] : l > 0.05 ? cols[2] : l > -0.45 ? cols[1] : cols[0];
    ctx.fillRect(x, y, 1, 1);
  }
}
const PINE = ['#12261a', '#1b3a26', '#265034', '#356842'], OAK = ['#1e3216', '#2c4a1e', '#3e6428', '#56803a'], BUSH = ['#24361a', '#34501f', '#466a2a', '#5e8a38'];

// standing trees are cached sprites; the shadow and a darkening as they burn are drawn on top
export function drawTree(ctx, p, g, h, kind = p.kind) {
  const v = p.seed % 4, big = kind === 'oak' ? 7 : kind === 'pine' ? 6 : 3.4, S = Math.ceil(big * 2 + 6);
  const spr = h.sprite(`${kind}${v}`, S, S, c => {
    const C = S / 2;
    if (kind === 'pine') {
      // layered rings, darker toward the outside, a pale tip in the middle
      canopy(c, C, C, big, PINE, v * 17, h.hash, 9);
      canopy(c, C - 0.5, C - 0.5, big * 0.62, PINE.slice(1).concat(['#4a7e52']), v * 31 + 5, h.hash, 6);
      c.fillStyle = '#6a9a62'; c.fillRect(Math.floor(C - 1), Math.floor(C - 1), 1, 1);
    } else canopy(c, C, C, big, kind === 'oak' ? OAK : BUSH, v * 23, h.hash, kind === 'oak' ? 6 : 5);
  });
  const x = Math.round(p.x), y = Math.round(p.y);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#05080a';
  ctx.beginPath?.();
  ctx.fillRect(x - big + 2, y - 1, big * 2 - 1, 3);
  ctx.globalAlpha = 1;
  const top = y - S + 3 + (kind === 'bush' ? 1 : 0);
  if (kind !== 'bush') { ctx.fillStyle = '#3a2618'; ctx.fillRect(x, y - 3, 1, 3); }
  ctx.drawImage(spr, x - Math.floor(S / 2), top);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / KB(p) * 0.9); ctx.drawImage(h.tinted(spr, '#1a120c'), x - Math.floor(S / 2), top); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), x - Math.floor(S / 2), top); ctx.globalAlpha = 1; }
}
const KB = p => kinds[p.kind]?.burnTime || 7;

// a felled tree: trunk along the fall direction, the crown squashed at the far end, splinters at the stump
export function drawFallen(ctx, p, g, h) {
  const a8 = Math.round(((p.fallA % TAU) + TAU) % TAU / TAU * 8) % 8, ang = a8 / 8 * TAU, v = p.seed % 2;
  const big = p.kind === 'oak' ? 6 : p.kind === 'pine' ? 5 : 3, L = p.kind === 'bush' ? 3 : 11;
  const S = 2 * (L + big + 3);
  const spr = h.sprite(`fallen-${p.kind}${a8}${v}`, S, S, c => {
    const C = S / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    if (p.kind !== 'bush') for (let i = 0; i <= L; i++) {
      const x = Math.round(C + ca * i), y = Math.round(C + sa * i);
      c.fillStyle = '#0e140c'; c.fillRect(x - 1, y, 3, 2);
      c.fillStyle = i % 3 ? '#5a3a22' : '#6e4a2a'; c.fillRect(x, y, 1, 1); c.fillRect(x, y + 1, 1, 1);
    }
    canopy(c, C + ca * (L + big * 0.4), C + sa * (L + big * 0.4), big * 0.85, p.kind === 'pine' ? PINE : p.kind === 'oak' ? OAK : BUSH, a8 * 7 + v, h.hash, 5);
    c.fillStyle = '#d8c39a'; c.fillRect(Math.round(C) - 1, Math.round(C) - 1, 1, 1); c.fillRect(Math.round(C) + 1, Math.round(C), 1, 1);
  });
  const x = Math.round(p.x) - S / 2, y = Math.round(p.y) - S / 2;
  ctx.drawImage(spr, x, y);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / KB(p) * 0.9); ctx.drawImage(h.tinted(spr, '#1a120c'), x, y); ctx.globalAlpha = 1; }
}

function drawProp(ctx, p, g, h) { if (p.state === 'up') drawTree(ctx, p, g, h); else drawFallen(ctx, p, g, h); }

export default {
  n: 2, id: 'forest', name: 'THE LOW WOOD', sub: 'WRECK THE TREES. VENGEANCE FILLS, CHAOS RISES.', mode: 'chaos',
  kinds,
  build(g, rng, P) { return build(g, rng, P); },
  art: { ground, props: { pine: drawProp, oak: drawProp, bush: drawProp }, canopy: false, theme: { leash: false } },
};
