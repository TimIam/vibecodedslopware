// Game state, tuning tables and save/load. Everything that persists between days lives in G.
import { FILMS, FILM_BY_ID } from './films.js';

export const SAVE_KEY = 'projmayhem_v1';
export const REEL_SECS = 36;            // one 35mm reel on screen (a real reel is ~20 min; time is squeezed)
export const MOTOR_CUE = 6.0;           // first cigarette burn, seconds before the end of the reel
export const CHANGE_CUE = 1.2;          // second cigarette burn
export const CUE_SHOW = 0.55;           // how long each burn stays visible
export const SEATS = 48;

export const CANDY = [
  { name: 'Senior Mints', icon: '🍬' },
  { name: 'Milk Dudes', icon: '🍫' },
  { name: 'Raisin Hell', icon: '🍇' },
  { name: 'Sour Patch Adults', icon: '🍋' },
  { name: 'Twizzle Sticks', icon: '🍭' },
  { name: 'Swedish Fishermen', icon: '🐟' },
];
export const CASE_CAP = 12;             // candy per slot in the display case
export const POP_CAP = 30;              // popcorn portions in the machine
export const SODA_CAP = 50;             // soda portions per syrup box hooked up

export const SUPPLY = {
  candy:   { label: 'Candy carton (24)', units: 24, cost: 22 },
  kernels: { label: 'Popcorn kernels (30 portions)', units: 30, cost: 14 },
  syrup:   { label: 'Soda syrup box (50 portions)', units: 50, cost: 16 },
};
export const UNIT_COST = { popcorn: 0.45, soda: 0.3, candy: 0.95 };
export const REF_PRICE = { ticket: 8, popcorn: 6, soda: 4, candy: 3 };

export const ROLES = {
  cashier:      { label: 'Box office cashier', wage: 55, blurb: 'Sells tickets so you don’t have to.' },
  concession:   { label: 'Concessions clerk', wage: 55, blurb: 'Works the candy counter.' },
  stocker:      { label: 'Stocker', wage: 45, blurb: 'Carries cartons out and refills the case, popper and soda.' },
  usher:        { label: 'Usher', wage: 40, blurb: 'Sweeps the auditoriums between shows.' },
  projectionist:{ label: 'Projectionist', wage: 85, blurb: 'Threads, starts shows, changes over, rewinds. Mostly on cue.' },
};
export const STAFF_NAMES = ['Bob Paulson', 'Marla', 'Angel Face', 'Lou', 'Ricky', 'Chloe', 'Walter', 'Irvin', 'Thomas', 'Big Bob', 'Raymond', 'Patrick', 'Seth', 'Steph'];

export const SCREEN_COST = [0, 0, 1800, 2600, 3600, 5000, 7000];   // by screen count after purchase
export const PLATTER_COST = 900;
export const DIGITAL_COST = 6000;
export function rentPerDay(nScreens) { return 30 + 25 * nScreens; }

export let G = null;

export function newGame() {
  G = {
    v: 1, day: 1, phase: 'closed', t: 0, cash: 350, act: 1, soul: 100, mayhem: 0, cult: 0, rep: 3.0, lifetime: 0,
    prices: { ...REF_PRICE },
    stock: { candy: [8, 8, 6, 6, 0, 0], popcorn: 18, soda: 30 },
    back: [ { kind: 'candy', i: 4, n: 24 }, { kind: 'kernels', n: 30 }, { kind: 'print', film: 'seven-salamis' } ],
    prints: {
      'casa-blanket': { state: 'built', quality: 0.95, mischief: [], days: 0, fresh: 1 },
      'seven-salamis': { state: 'cans', quality: 0, mischief: [], days: 0, fresh: 1 },
    },
    screens: [1, 2, 3, 4, 5, 6].map(id => ({ id, open: id === 3, tier: 'reel', film: id === 3 ? 'casa-blanket' : null, poster: id === 3 ? 'casa-blanket' : null, trash: 0 })),
    staff: [],
    orders: [],
    catalog: [],
    flags: { tut: 0, omni: false, omniOfferDay: 0, omniDays: 0, finale: false, monkeys: false, sabotage: {}, story: {} },
    stats: { day: null, history: [] },
  };
  rollCatalog();
  return G;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || g.v !== 1) return null;
    G = g;
    G.phase = 'closed';
    return G;
  } catch { return null; }
}
// Runtime-only fields (3D objects on pallet items, booth show objects on the schedule) never go in the save.
const SKIP = new Set(['bs', 'audience', 'spawnTimes', 'shows']);
export function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G, (k, v) => (k[0] === '_' || SKIP.has(k) ? undefined : v))); }
  catch (e) { console.warn('save failed', e); }
}
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export function openScreens() { return G.screens.filter(s => s.open); }
export function film(id) { return FILM_BY_ID[id]; }
export function runtime(f) { return f.reels * REEL_SECS; }
export function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString(); }

// Which films can be booked this act. OmniPlex refuses arthouse; after the finale it's arthouse and cult only.
export function bookable() {
  return FILMS.filter(f => {
    if (G.prints[f.id]) return false;
    if (f.id === 'bite-club') return G.act >= 4 && G.flags.finale;
    if (G.flags.finale) return f.kind !== 'blockbuster';
    if (G.flags.omni) return f.kind !== 'arthouse';
    if (f.kind === 'blockbuster') return G.act >= 2;
    return true;
  });
}
export function rollCatalog() {
  const pool = bookable();
  const out = [];
  if (G.act >= 4 && G.flags.finale && !G.prints['bite-club']) out.push('bite-club');
  const seed = G.day * 977 + G.act * 31;
  const sorted = pool.filter(f => !out.includes(f.id)).map((f, i) => [f, Math.sin(seed + i * 12.9898) * 43758.5453 % 1]).sort((a, b) => a[1] - b[1]);
  for (const [f] of sorted) { if (out.length >= 6) break; out.push(f.id); }
  G.catalog = out;
}

// Ticket demand for one show. Appeal * novelty * reputation * price * poster, scaled to the house.
export function showDemand(screen, opts = {}) {
  const f = film(screen.film);
  if (!f) return 0;
  const pr = G.prints[screen.film];
  const fresh = pr ? pr.fresh : 1;
  const rep = 0.55 + G.rep / 5 * 0.9;
  const price = Math.exp(-(G.prices.ticket - REF_PRICE.ticket) / 9);
  const poster = screen.poster === screen.film ? 1 : 0.55;
  const act = G.flags.omni ? 1.35 : 1;
  const hipBoost = (G.flags.finale ? 0.15 : 0) + f.hip * 0.25;
  const n = SEATS * (f.appeal * 0.75 + hipBoost) * fresh * rep * price * poster * act * 0.72;
  return Math.max(2, Math.min(SEATS, Math.round(n * (opts.jitter ?? 1))));
}
