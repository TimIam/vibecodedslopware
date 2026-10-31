// The six floors of Paperweight & Partners. Every map is COLS x ROWS characters:
//
//   #  wall          D  desk          P  potted plant     R  printer (lobs paper jams)
//   .  carpet        ,  linoleum      ~  spilled coffee   =  cable tangle   x  thumbtacks
//   > < ^ V  air vent pushing that way
//   S  start         *  report page   c  coffee cup (restores composure)
//   E  freight elevator (opens once every page is collected)
//   b  floor-buffing robot (left/right)   y  floor-buffing robot (up/down)   m  Calendar Carl

import { TILE, COLS, ROWS } from './config.js';

export const LEVELS = [
  {
    id: 'orientation', floor: 1, name: 'Orientation', par: 40,
    map: [
      '##############################',
      '#S...........#...............#',
      '#............#.......*.......#',
      '#..DDD...DDD.#...DDD...DDD...#',
      '#............#...............#',
      '#.....*......#...............#',
      '#............###.....P.......#',
      '#..P.................P.......#',
      '#........................c...#',
      '#####.....DDDD....############',
      '#...................#........#',
      '#..*..DDD...........#....*...#',
      '#.......D...........#........#',
      '#.......D....P......#...DDD..#',
      '#...................#........#',
      '#.......................P..EE#',
      '#..........................EE#',
      '##############################',
    ],
  },
  {
    id: 'break-room', floor: 2, name: 'Break Room Spill', par: 55,
    map: [
      '##############################',
      '#S.....#,,,,,,,,,,,,,,,,,,,,,#',
      '#......#,,,,~~~~,,,,,,,,*,,,,#',
      '#..*...#,,,,~~~~~~,,,DD,,,,,,#',
      '#......#,,,,,~~~~,,,,DD,,,,,,#',
      '#......,,,,,,,,,,,,,,,,,,,,,,#',
      '#..DD..#,,b,,,,,,,,,,,,,,,*,,#',
      '#..DD..#,,,,,,,,,,,,,,,,,,,,,#',
      '#......#######,,,,,########,,#',
      '#......#.....#,,,,,#.........#',
      '#..P.......*.#,,~,,#....c....#',
      '#......#.....#,,~,,#.........#',
      '#......#.....#,y,,,......*...#',
      '#####..#..DD.#,,,,,#.........#',
      '#......#.....#,,,,,#..DDDD...#',
      '#..*...#.....#,,,,,#.......EE#',
      '#............#,,,,,........EE#',
      '##############################',
    ],
  },
  {
    id: 'open-plan', floor: 3, name: 'Open Plan', par: 60,
    map: [
      '##############################',
      '#S..........x................#',
      '#...........x.....m..........#',
      '#.DDD.DDD.DDD.DDD.DDD.DDD.DD.#',
      '#..*......................*..#',
      '#.DDD.DDD.DDD.DDD.DDD.DDD.DD.#',
      '#............................#',
      '#....xxx.........P....xxx....#',
      '#.............*..............#',
      '#.DDD.DDD.DDD.DDD.DDD.DDD.DD.#',
      '#.......c.........*..........#',
      '#.DDD.DDD.DDD.DDD.DDD.DDD.DD.#',
      '#............................#',
      '#..m......P.......x..........#',
      '######..........xxx......#####',
      '#*.........................EE#',
      '#.....P....................EE#',
      '##############################',
    ],
  },
  {
    id: 'print-room', floor: 4, name: 'The Print Room', par: 70,
    map: [
      '##############################',
      '#S....=====......#...........#',
      '#.....=====......#..R.....*..#',
      '#.....=====..*...#...........#',
      '#................#....===....#',
      '#####.....############===....#',
      '#*..#.....#,,,,,,,,,,#...R...#',
      '#...#..R..#,,*,,,,,,,#.......#',
      '#...#.....#,,,,,,R,,,#.......#',
      '#.........#,,,,,,,,,,......c.#',
      '#...#.....#,,,,,,,,*,#.......#',
      '#...#.....###,,,######..===..#',
      '#.c.#.......=,,,=.......===..#',
      '#...######..=,,,=.......===..#',
      '#...........=,,,=.....R......#',
      '#..*........=====.........EE.#',
      '#.........................EE.#',
      '##############################',
    ],
  },
  {
    id: 'hvac-annex', floor: 5, name: 'HVAC Annex', par: 70,
    map: [
      '##############################',
      '#S.......>>>>>>>>>...........#',
      '#........>>>>>>>>>.......*...#',
      '#..DD....>>>>>>>>>....DD.....#',
      '#..DD.................DD.....#',
      '#.........b..................#',
      '###########^^^^###VVVV########',
      '#.........#^^^^#..VVVV.......#',
      '#..*......#^^^^#..VVVV...*...#',
      '#.........#^^^^#..VVVV.......#',
      '#....~~~~.#....#.........c...#',
      '#....~~~~.......<<<<<<<<.....#',
      '#.y.......#.....<<<<<<<<.....#',
      '#.........#..*..<<<<<<<<..P..#',
      '#...P.....#.....#............#',
      '#.........#.....#...b......EE#',
      '#.*.......#.....#..........EE#',
      '##############################',
    ],
  },
  {
    id: 'boardroom-run', floor: 6, name: 'Boardroom Run', par: 90,
    map: [
      '##############################',
      '#S...x....=====....R.....*...#',
      '#....x....=====..........~~..#',
      '#.DD.x..m.......DDDD.....~~.*#',
      '#.DD......###########........#',
      '#.........#,,,,,,,,,#..m.....#',
      '#*........#,,,,,,,,,#....DD..#',
      '####.......,,,b,,,,,,....DD..#',
      '#.........#,,,,,,,,,#........#',
      '#..R......#,,,,*,,,,#....>>>>#',
      '#.........#####,#####....>>>>#',
      '#..~~~~.......=.......y......#',
      '#..~~~~..c....=..............#',
      '#.......xxxx..=....DDDD..R...#',
      '#####.........=....DDDD......#',
      '#*..m.....*........<<<<....EE#',
      '#...P..............<<<<....EE#',
      '##############################',
    ],
  },
];

const SOLIDS = { '#': 'wall', D: 'desk', P: 'plant', R: 'printer' };
const FLOOR_CHARS = { '.': 'carpet', ',': 'lino', '~': 'coffee', '=': 'cable', x: 'carpet', '>': 'vent', '<': 'vent', '^': 'vent', V: 'vent' };
const DRAFTS = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], V: [0, 1] };
const ENTITIES = new Set(['S', '*', 'c', 'b', 'y', 'm']);

export const LEGAL_CHARS = new Set([...Object.keys(SOLIDS), ...Object.keys(FLOOR_CHARS), ...ENTITIES, 'E']);

const center = (col, row) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

// The floor under an entity is whatever floor most of its neighbours have.
function floorUnder(map, col, row) {
  const counts = {};
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const f = FLOOR_CHARS[(map[row + dr] || '')[col + dc]];
    if (f && f !== 'vent') counts[f] = (counts[f] || 0) + 1;
  }
  let best = 'carpet', n = 0;
  for (const [f, k] of Object.entries(counts)) if (k > n) { best = f; n = k; }
  return best;
}

export function parseLevel(def) {
  const { map } = def;
  if (map.length !== ROWS) throw new Error(`${def.id}: expected ${ROWS} rows, got ${map.length}`);
  const out = { cols: COLS, rows: ROWS, tiles: [], start: null, pages: [], coffees: [], bots: [], carls: [], printers: [], exits: [] };
  map.forEach((line, row) => {
    if (line.length !== COLS) throw new Error(`${def.id}: row ${row} has ${line.length} columns, expected ${COLS}`);
    const tiles = [];
    [...line].forEach((ch, col) => {
      if (!LEGAL_CHARS.has(ch)) throw new Error(`${def.id}: unknown tile '${ch}' at ${col},${row}`);
      const tile = { ch, kind: 'floor', solid: false, floor: 'carpet', tacks: false, draft: null };
      if (SOLIDS[ch]) { tile.kind = SOLIDS[ch]; tile.solid = true; }
      else if (FLOOR_CHARS[ch]) { tile.floor = FLOOR_CHARS[ch]; tile.tacks = ch === 'x'; tile.draft = DRAFTS[ch] || null; }
      else if (ch === 'E') { tile.kind = 'exit'; out.exits.push({ col, row }); }
      else tile.floor = floorUnder(map, col, row);
      const p = center(col, row);
      if (ch === 'S') out.start = p;
      else if (ch === '*') out.pages.push({ ...p, taken: false });
      else if (ch === 'c') out.coffees.push({ ...p, taken: false });
      else if (ch === 'b' || ch === 'y') out.bots.push({ ...p, dx: ch === 'b' ? 1 : 0, dy: ch === 'y' ? 1 : 0, stun: 0 });
      else if (ch === 'm') out.carls.push({ ...p, home: { ...p }, stun: 0, cooldown: 0, say: 0, line: 0 });
      else if (ch === 'R') out.printers.push({ col, row, ...p, timer: 0 });
      tiles.push(tile);
    });
    out.tiles.push(tiles);
  });
  if (!out.start) throw new Error(`${def.id}: no start tile`);
  // stagger the printers so they don't all fire on the same beat
  out.printers.forEach((p, i) => { p.timer = 1.2 + (i * 0.7) % 2.4; });
  return out;
}
