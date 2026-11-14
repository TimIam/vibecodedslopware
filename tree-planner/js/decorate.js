// Design factories and the automatic decorator.
import { SPECIES, ALL_TREES, THEMES, PAPERS, BOXES, RIBBONS, BOWS, CARDS, RIBBON_COLORS, SKIRTS } from './data.js';
import { buildDesign, visibleArc, sampleCanopy, toOrnCoords } from './scene.js';
import { rng } from './textures.js';
import { uid } from './store.js';

export function newDesign(over = {}) {
  return { id: uid(), name: '', species: 'fraser', height: 84, units: 'in', walls: [], rotation: 0, seed: Math.floor(Math.random() * 1e6) + 1,
    flock: 0, topper: null, ornaments: [], strands: [], skirt: null, presents: [], ...over };
}

export function randomPresent(r = Math.random) {
  const box = BOXES[Math.floor(r() * BOXES.length)];
  const paper = PAPERS[Math.floor(r() * (PAPERS.length - 1))];
  const rib = RIBBONS[1 + Math.floor(r() * (RIBBONS.length - 1))].id;
  const rc = RIBBON_COLORS[Math.floor(r() * RIBBON_COLORS.length)];
  return { id: uid(), box: box.id, w: box.w, d: box.d, h: box.h, paper: { style: paper.id, c1: paper.c1, c2: paper.c2 },
    ribbon: { style: rib, color: rc }, bow: { style: BOWS[1 + Math.floor(r() * (BOWS.length - 1))].id, color: rc },
    card: r() < 0.5 ? { type: CARDS[1 + Math.floor(r() * 3)].id, color: '#f5f0e0', to: '', from: '' } : { type: 'none' } };
}

// Decorate only the part of the tree people will see. location: 'corner' | 'wall' | 'middle'.
export function autoDecorate(design, opts, ctx = {}) {
  const theme = THEMES.find(t => t.id === opts.theme) || THEMES[0];
  const r = rng(design.seed * 13 + 5);
  if (opts.location === 'middle') design.walls = [];
  else if (opts.location === 'wall' && design.walls.length !== 1) design.walls = ['back'];
  else if (opts.location === 'corner' && design.walls.length !== 2) design.walls = ['back', 'left'];
  const arc = visibleArc(design.walls);
  const inc = opts.include || {};
  const built = buildDesign({ ...design, ornaments: [], strands: [], presents: [], skirt: null, topper: null }, ctx);
  if (inc.lights !== false) { design.strands = design.strands.filter(s => s.kind !== 'lights'); const [style, color, mode] = theme.lights; design.strands.push({ id: uid(), kind: 'lights', style, color, mode, wraps: Math.round(design.height / 11), seed: Math.floor(r() * 1e5) }); }
  if (inc.garland !== false && theme.garland) { design.strands = design.strands.filter(s => s.kind !== 'garland'); design.strands.push({ id: uid(), kind: 'garland', style: theme.garland[0], color: theme.garland[1], wraps: Math.round(design.height / 20), seed: Math.floor(r() * 1e5) }); }
  if (inc.tinsel !== false && theme.tinsel) { design.strands = design.strands.filter(s => s.kind !== 'tinsel'); design.strands.push({ id: uid(), kind: 'tinsel', color: theme.tinsel, amount: 0.6, seed: Math.floor(r() * 1e5) }); }
  if (inc.ornaments !== false) {
    const area = arc.half / Math.PI;
    const n = Math.round(design.height * 0.9 * area * (opts.density || 1));
    const pts = sampleCanopy(built, n, arc, design.seed * 3 + 1, Math.max(3, design.height / 14));
    const sizes = design.height > 72 ? ['M', 'L', 'M', 'S', 'L', 'XL'] : ['S', 'M', 'S', 'M'];
    design.ornaments = design.ornaments.filter(o => o.manual);
    const pool = [...theme.orn];
    if (ctx.customs?.size && inc.customs) for (const id of ctx.customs.keys()) pool.push(['custom', 'white', 'matte', id]);
    pts.forEach((p, i) => { const [type, color, finish, customId] = pool[Math.floor(r() * pool.length)]; design.ornaments.push({ id: uid(), type, color, finish, customId, size: sizes[i % sizes.length], ...toOrnCoords(p, built.shape), spin: r() * 6.28 }); });
  }
  if (inc.topper !== false) design.topper = { type: theme.topper[0], color: theme.topper[1] };
  if (inc.skirt !== false) design.skirt = { style: theme.skirt[0], color: theme.skirt[1], color2: '#f7f7f2' };
  if (inc.presents !== false && !design.presents.length) { const k = 3 + Math.floor(r() * 5); for (let i = 0; i < k; i++) design.presents.push(randomPresent(r)); }
  built.dispose();
  return design;
}

export function randomDesign(over = {}) {
  const r = Math.random;
  const sp = r() < 0.75 ? SPECIES[Math.floor(r() * SPECIES.length)] : ALL_TREES[Math.floor(r() * ALL_TREES.length)];
  const d = newDesign({ species: sp.id, height: 66 + Math.round(r() * 30), flock: r() < 0.2 ? 1 + Math.floor(r() * 2) : 0, ...over });
  if (over.maxHeight) d.height = Math.min(d.height, over.maxHeight), delete d.maxHeight;
  const loc = d.walls.length === 2 ? 'corner' : d.walls.length === 1 ? 'wall' : 'middle';
  autoDecorate(d, { theme: THEMES[Math.floor(r() * THEMES.length)].id, location: loc, include: {} });
  d.name = `${sp.name} (random)`;
  return d;
}
export { SKIRTS };
