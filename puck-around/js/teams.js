// Eight made-up clubs. j jersey, t trim, p pants, h helmet.
export const TEAMS = [
  { name: 'YETIS', abbr: 'YET', j: '#1f3fa8', t: '#7fdbff', p: '#0d1b4a', h: '#7fdbff' },
  { name: 'LAVA HOUNDS', abbr: 'LAV', j: '#c62828', t: '#ffb300', p: '#2b0d0d', h: '#1a1a1a' },
  { name: 'MOSS KINGS', abbr: 'MOS', j: '#2e7d32', t: '#ffd54f', p: '#123016', h: '#ffd54f' },
  { name: 'NIGHT SHIFT', abbr: 'NIT', j: '#5e35b1', t: '#ffee58', p: '#1c1038', h: '#141414' },
  { name: 'RUST BELT', abbr: 'RST', j: '#e65100', t: '#3e2723', p: '#3e2723', h: '#3e2723' },
  { name: 'BUBBLEGUM', abbr: 'BUB', j: '#ec407a', t: '#26c6da', p: '#4a148c', h: '#26c6da' },
  { name: 'ZAMBONIS', abbr: 'ZAM', j: '#263238', t: '#b0bec5', p: '#111111', h: '#b0bec5' },
  { name: 'MUSTARD GANG', abbr: 'MUS', j: '#f9a825', t: '#212121', p: '#212121', h: '#212121' },
];
// Colours for the two sides of a match; the same club twice puts the visitors in their trim colour.
export function kits(a, b) {
  const A = TEAMS[a] || TEAMS[0], B0 = TEAMS[b] || TEAMS[1];
  const B = a === b ? { ...B0, name: B0.name + ' B', j: B0.t, t: B0.j, h: B0.j } : B0;
  return [A, B];
}
export const PLAYER_COLORS = ['#ffe14d', '#4dd2ff', '#ff7ad9', '#7dff7a'];
