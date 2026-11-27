// A tree design is plain JSON: what it's made of, never the geometry. Saved in localStorage
// and packed into share links. Ornament positions are stored against the tree's outline
// (height fraction, angle, depth), so they stay on the branches when the tree changes size.
import { makeRng } from './util.js';
import { ORN_COLORS, ORNAMENTS, randomGift, placeGift } from './decor.js';
import { makeProfile, SPECIES } from './tree.js';

export const FT = 0.3048;

export function defaultDesign() {
  return {
    v: 1,
    name: 'My tree',
    tree: { species: 'fraser', height: 7 * FT, width: 1, fullness: 1, seed: 1 },
    base: { stand: 'bucket', skirt: 'velvet' },
    lights: { style: 'warm', density: 1, mode: 'twinkle', seed: 3 },
    garland: { style: 'gold', wraps: 4, seed: 9 },
    topper: 'star',
    ornaments: [],
    gifts: [],
  };
}

export const THEMES = {
  classic: { label: 'Classic red & gold', types: ['bauble', 'bauble', 'bauble', 'finial', 'bell', 'star', 'cane'], colors: ['#b3121f', '#d9ab4f', '#b3121f', '#f2efe6'], finishes: ['gloss', 'mirror', 'matte', 'glitter'] },
  frost:   { label: 'Frost', types: ['bauble', 'bauble', 'finial', 'icicle', 'flake', 'icicle'], colors: ['#c9ccd2', '#1e4fa8', '#f2efe6', '#16808a'], finishes: ['mirror', 'matte', 'glitter', 'gloss'] },
  rustic:  { label: 'Cabin in the woods', types: ['cone', 'cone', 'ginger', 'bauble', 'bell', 'gift'], colors: ['#b3121f', '#b8693a', '#1f6b3a', '#e8d3a2'], finishes: ['matte', 'matte', 'gloss'] },
  candy:   { label: 'Candy land', types: ['cane', 'cane', 'ginger', 'bauble', 'finial', 'gift'], colors: ['#e07aa8', '#f2efe6', '#b3121f', '#16808a'], finishes: ['gloss', 'stripe', 'glitter'] },
  jewel:   { label: 'Jewel box', types: ['bauble', 'bauble', 'finial', 'finial', 'star'], colors: ['#6a2c91', '#16808a', '#1a2340', '#d9ab4f', '#b3121f'], finishes: ['mirror', 'glitter', 'gloss'] },
  chaos:   { label: 'Everything, everywhere', types: Object.keys({ bauble: 1, finial: 1, icicle: 1, cane: 1, star: 1, flake: 1, bell: 1, cone: 1, ginger: 1, pickle: 1, gift: 1 }), colors: ORN_COLORS.map(c => c[0]), finishes: ['gloss', 'mirror', 'matte', 'glitter', 'stripe'] },
  pickle:  { label: 'Pickle maximalist', types: ['pickle'], colors: ['#1f6b3a'], finishes: ['gloss'] },
};

// Spread ornaments evenly over the outline (area-weighted sunflower spiral), with jitter.
export function autoDecorate(design, themeKey, seed = Date.now() & 0xffff) {
  const theme = THEMES[themeKey] || THEMES.classic;
  const rng = makeRng(seed);
  const t = design.tree;
  const heightFt = t.height / FT;
  const n = Math.round(heightFt * (t.species === 'scraggly' ? 4 : 12));
  const out = [];
  const golden = 2.39996323;
  for (let i = 0; i < n; i++) {
    // Equal area on a cone: height fraction from the square root.
    const u = (i + 0.5) / n;
    const f = Math.max(0.03, Math.min(0.92, 1 - Math.sqrt(1 - u * 0.97) + (rng() - 0.5) * 0.03));
    const a = i * golden + (rng() - 0.5) * 0.4;
    const type = theme.types[Math.floor(rng() * theme.types.length)];
    out.push({
      t: type,
      c: theme.colors[Math.floor(rng() * theme.colors.length)],
      f: theme.finishes[Math.floor(rng() * theme.finishes.length)],
      y: f, a, d: 0.9 + rng() * 0.08,
      s: (type === 'bauble' ? [0.8, 1, 1, 1.3][Math.floor(rng() * 4)] : 1) * (1.1 - f * 0.4),
      seed: rng(),
    });
  }
  // Big ones low and outside, small ones high: the way people actually do it.
  design.ornaments = out;
  return design;
}

export function addGift(design, seed = Date.now() & 0xffff) {
  const rng = makeRng(seed);
  const sp = SPECIES[design.tree.species] || SPECIES.fraser;
  const P = makeProfile(sp, design.tree.height, design.tree.width);
  const info = { trunkR: 0.022 + 0.018 * design.tree.height, R0: P.R0 };
  const skirtR = Math.min(0.8, Math.max(0.32, P.R0 * 0.75 + 0.1));
  const gf = randomGift(rng);
  placeGift(info, design.gifts, gf, rng, skirtR);
  design.gifts.push(gf);
  return gf;
}

// ---------------------------------------------------------------- storage and links
const KEY = 'augtree.v1';

export function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { current: null, saved: [] }; } catch { return { current: null, saved: [] }; }
}
export function saveAll(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

// Short links: everything packed as small integers (centimetres, hundredths of a turn,
// indices into the option lists), then deflated. A fully decorated tree fits in a QR code.
const TYPES = Object.keys(ORNAMENTS), FINS = ['gloss', 'mirror', 'matte', 'glitter', 'stripe'], COLS = ORN_COLORS.map(c => c[0]);
const TAU = Math.PI * 2;
function pack(d) {
  const r = (x, k = 1000) => Math.round(x * k) / k;
  const col = c => { const i = COLS.indexOf(c); return i >= 0 ? i : c; };
  return {
    v: 2, n: d.name, t: [d.tree.species, r(d.tree.height), r(d.tree.width, 100), r(d.tree.fullness, 100), d.tree.seed],
    b: [d.base.stand, d.base.skirt], l: [d.lights.style, r(d.lights.density, 100), d.lights.mode], g: [d.garland.style, d.garland.wraps], p: d.topper,
    o: d.ornaments.flatMap(o => [TYPES.indexOf(o.t), col(o.c), FINS.indexOf(o.f || 'gloss'), Math.round(o.y * 999), Math.round((((o.a % TAU) + TAU) % TAU) / TAU * 999), Math.round((o.d ?? 0.93) * 99), Math.round((o.s ?? 1) * 99), Math.round((o.seed ?? 0.5) * 99)]),
    x: d.gifts.map(g => [Math.round(g.w * 100), Math.round(g.h * 100), Math.round(g.d * 100), Math.round(g.x * 100), Math.round((g.y ?? 0.01) * 100), Math.round(g.z * 100), Math.round((g.ry ?? 0) * 100), g.paper, col(g.c1), col(g.c2), col(g.ribbon), g.bow ? 1 : 0, g.stack ? 1 : 0]),
  };
}
function unpack(p) {
  const d = defaultDesign();
  const col = c => (typeof c === 'number' ? COLS[c] : c);
  d.name = p.n || d.name;
  [d.tree.species, d.tree.height, d.tree.width, d.tree.fullness, d.tree.seed] = p.t;
  [d.base.stand, d.base.skirt] = p.b;
  [d.lights.style, d.lights.density, d.lights.mode] = p.l;
  [d.garland.style, d.garland.wraps] = p.g;
  d.topper = p.p;
  d.ornaments = [];
  const o = p.o || [];
  for (let i = 0; i + 7 < o.length; i += 8) d.ornaments.push({ t: TYPES[o[i]] || 'bauble', c: col(o[i + 1]), f: FINS[o[i + 2]] || 'gloss', y: o[i + 3] / 999, a: o[i + 4] / 999 * TAU, d: o[i + 5] / 99, s: o[i + 6] / 99, seed: o[i + 7] / 99 });
  d.gifts = (p.x || []).map(([w, h, dd, x, y, z, ry, paper, c1, c2, ribbon, bow, stack]) => ({ w: w / 100, h: h / 100, d: dd / 100, x: x / 100, y: y / 100, z: z / 100, ry: ry / 100, paper, c1: col(c1), c2: col(c2), ribbon: col(ribbon), bow: !!bow, stack: !!stack }));
  return d;
}

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function encodeDesign(d) {
  const json = new TextEncoder().encode(JSON.stringify(pack(d)));
  if (typeof CompressionStream === 'undefined') return 'j' + b64u(json);
  const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64u(await new Response(cs).arrayBuffer());
}

export async function decodeDesign(s) {
  try {
    const kind = s[0], bytes = unb64u(s.slice(1));
    let text;
    if (kind === 'z') text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    else text = new TextDecoder().decode(bytes);
    return unpack(JSON.parse(text));
  } catch (e) { console.warn('bad design link', e); return null; }
}

export function clone(d) { return JSON.parse(JSON.stringify(d)); }
