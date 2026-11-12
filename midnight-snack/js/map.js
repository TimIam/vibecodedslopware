// The house: rooms, doors, furniture, food, creaky boards, and the grid helpers
// (walkability, line of sight, BFS pathing) that the player, the monster and sound share.

export const W = 48, H = 30;

export const ROOMS = [
  { id: "bedroom", name: "Case's Room", x: 1, y: 1, w: 13, h: 9, floor: "carpet", wall: "#4a3a5e" },
  { id: "bath", name: "Bathroom", x: 15, y: 1, w: 7, h: 9, floor: "tile", wall: "#4f6d78" },
  { id: "kitchen", name: "Kitchen", x: 23, y: 1, w: 24, h: 9, floor: "checker", wall: "#7a6a42" },
  { id: "hall", name: "Hallway", x: 1, y: 11, w: 46, h: 2, floor: "wood", wall: "#5e4334" },
  { id: "living", name: "Living Room", x: 1, y: 14, w: 19, h: 15, floor: "wood", wall: "#56432f" },
  { id: "dining", name: "Dining Room", x: 21, y: 14, w: 13, h: 15, floor: "wood", wall: "#465334" },
  { id: "pantry", name: "Pantry", x: 35, y: 14, w: 12, h: 6, floor: "wood", wall: "#665538" },
  { id: "garage", name: "Garage", x: 35, y: 21, w: 12, h: 8, floor: "concrete", wall: "#474a4d" },
];

const DOORS = [[7, 10], [18, 10], [27, 10], [28, 10], [10, 13], [27, 13], [28, 13], [40, 13], [40, 20], [20, 20], [20, 21]];

export const FOOD = {
  pizza: { n: "Whole Pizza", kcal: 2300, wt: 4, e: "🍕" },
  slice: { n: "Cold Pizza Slice", kcal: 285, wt: 1, e: "🍕" },
  chicken: { n: "Rotisserie Chicken", kcal: 1600, wt: 3, e: "🍗" },
  milk: { n: "Gallon of Whole Milk", kcal: 2400, wt: 4, e: "🥛" },
  lasagna: { n: "Leftover Lasagna", kcal: 2000, wt: 3, e: "🍝" },
  butter: { n: "Stick of Butter", kcal: 810, wt: 1, e: "🧈" },
  mayo: { n: "Family Jar of Mayo", kcal: 5600, wt: 3, e: "🫙" },
  cheesecake: { n: "Whole Cheesecake", kcal: 3200, wt: 3, e: "🍰" },
  pudding: { n: "Pudding Cups", kcal: 600, wt: 1, e: "🍮" },
  hotdogs: { n: "Pack of Hot Dogs", kcal: 1200, wt: 1, e: "🌭" },
  chips: { n: "Family Size Chips", kcal: 1500, wt: 1, e: "🥔" },
  honeybuns: { n: "Box of Honey Buns", kcal: 2400, wt: 2, e: "🥯" },
  pb: { n: "Peanut Butter Jar", kcal: 5400, wt: 3, e: "🥜" },
  poptarts: { n: "Toaster Pastries", kcal: 1600, wt: 1, e: "🧇" },
  cereal: { n: "Cereal Box", kcal: 1500, wt: 1, e: "🥣" },
  ramen: { n: "Ramen 12-Pack", kcal: 4500, wt: 2, e: "🍜" },
  cookies: { n: "Sandwich Cookies", kcal: 2400, wt: 1, e: "🍪" },
  donuts: { n: "Dozen Donuts", kcal: 3000, wt: 2, e: "🍩" },
  hotpocket: { n: "Lost Hot Pocket", kcal: 300, wt: 1, e: "🥟" },
  burrito: { n: "Half a Burrito", kcal: 500, wt: 1, e: "🌯" },
  gummies: { n: "Couch Gummy Bears", kcal: 400, wt: 1, e: "🐻" },
  fries: { n: "Ancient Fries", kcal: 350, wt: 1, e: "🍟" },
  candy: { n: "Candy Bowl", kcal: 900, wt: 1, e: "🍬" },
  wings: { n: "Leftover Wings", kcal: 1100, wt: 1, e: "🍗" },
  cake: { n: "Birthday Cake", kcal: 4800, wt: 4, e: "🎂" },
  sub: { n: "Six-Foot Party Sub", kcal: 6000, wt: 6, e: "🥖" },
  pie: { n: "Apple Pie", kcal: 2400, wt: 2, e: "🥧" },
  turkey: { n: "FROZEN TURKEY", kcal: 12000, wt: 9, e: "🦃" },
  icecream: { n: "Ice Cream Tub", kcal: 1300, wt: 2, e: "🍨" },
  burritos: { n: "Frozen Burrito Box", kcal: 3600, wt: 3, e: "🌯" },
  rolls: { n: "Pizza Rolls Party Bag", kcal: 3800, wt: 2, e: "🍕" },
  soda: { n: "2-Liter Soda", kcal: 800, wt: 2, e: "🥤" },
  jerky: { n: "Beef Jerky", kcal: 900, wt: 1, e: "🥓" },
  snickers: { n: "Emergency Candy Bar", kcal: 500, wt: 1, e: "🍫" },
};

const POOLS = {
  fridge: ["pizza", "chicken", "milk", "lasagna", "butter", "mayo", "cheesecake", "pudding", "hotdogs", "slice"],
  pantry: ["chips", "honeybuns", "pb", "poptarts", "cereal", "ramen", "cookies", "donuts"],
  counter: ["chips", "donuts", "cookies", "slice", "honeybuns", "poptarts", "cereal"],
  couch: ["hotpocket", "burrito", "gummies", "fries"],
  coffee: ["candy", "wings", "chips"],
  table: ["cake", "sub", "pie", "wings"],
  freezer: ["icecream", "burritos", "rolls"],
  garage: ["soda", "jerky", "snickers", "chips"],
};

// k: kind (drawing), pool/cap: food it holds, hide: hiding-spot label, open: has a door that lights up
export const FURN_DEF = [
  { k: "bed", x: 2, y: 2, w: 3, h: 4, hide: "under the covers" },
  { k: "desk", x: 9, y: 1, w: 4, h: 1, stash: true, name: "the stash" },
  { k: "dresser", x: 1, y: 8, w: 2, h: 1, pool: "couch", cap: 1, name: "dresser" },
  { k: "tub", x: 15, y: 1, w: 3, h: 2, hide: "behind the shower curtain" },
  { k: "toilet", x: 21, y: 1, w: 1, h: 1 },
  { k: "sink", x: 19, y: 1, w: 1, h: 1 },
  { k: "counter", x: 23, y: 1, w: 6, h: 1, pool: "counter", cap: 2, name: "counter" },
  { k: "stove", x: 29, y: 1, w: 2, h: 1 },
  { k: "fridge", x: 31, y: 1, w: 2, h: 1, pool: "fridge", cap: 4, open: true, name: "THE FRIDGE" },
  { k: "counter", x: 33, y: 1, w: 6, h: 1, pool: "counter", cap: 2, name: "counter" },
  { k: "cabinet", x: 41, y: 1, w: 5, h: 1, pool: "pantry", cap: 2, name: "snack cabinet" },
  { k: "island", x: 29, y: 5, w: 6, h: 2, pool: "counter", cap: 2, name: "island" },
  { k: "trash", x: 46, y: 9, w: 1, h: 1 },
  { k: "couch", x: 5, y: 19, w: 7, h: 1, pool: "couch", cap: 2, hide: "in the couch cushions", name: "couch cushions" },
  { k: "tv", x: 6, y: 28, w: 5, h: 1 },
  { k: "coffee", x: 7, y: 22, w: 3, h: 1, pool: "coffee", cap: 1, name: "coffee table" },
  { k: "fort", x: 15, y: 25, w: 3, h: 3, hide: "in the blanket fort" },
  { k: "lamp", x: 1, y: 14, w: 1, h: 1 },
  { k: "table", x: 24, y: 18, w: 6, h: 3, pool: "table", cap: 2, hide: "under the table", name: "dining table" },
  { k: "china", x: 21, y: 14, w: 3, h: 1, pool: "pantry", cap: 1, name: "china cabinet" },
  { k: "shelf", x: 35, y: 14, w: 4, h: 1, pool: "pantry", cap: 2, name: "pantry shelf" },
  { k: "shelf", x: 42, y: 14, w: 5, h: 1, pool: "pantry", cap: 2, name: "pantry shelf" },
  { k: "shelf", x: 37, y: 17, w: 6, h: 1, pool: "pantry", cap: 3, name: "pantry shelf" },
  { k: "car", x: 37, y: 23, w: 4, h: 4, hide: "in the car" },
  { k: "workbench", x: 43, y: 21, w: 4, h: 1, pool: "garage", cap: 1, name: "workbench" },
  { k: "freezer", x: 44, y: 27, w: 2, h: 1, pool: "freezer", cap: 2, open: true, name: "deep freezer" },
  { k: "sodafridge", x: 35, y: 28, w: 1, h: 1, pool: "garage", cap: 1, name: "garage fridge" },
];

export const WAYPOINTS = [[7, 7], [18, 5], [26, 4], [37, 6], [43, 6], [5, 11], [16, 12], [30, 11], [44, 12],
  [10, 16], [4, 25], [12, 24], [26, 15], [31, 25], [23, 26], [40, 15], [44, 18], [42, 25], [36, 22]];

const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

export function makeHouse(night, rnd = Math.random) {
  const grid = new Uint8Array(W * H).fill(1); // 1 wall, 2 furniture, 0 floor
  const room = new Int8Array(W * H).fill(-1);
  const furnAt = new Int16Array(W * H).fill(-1);
  ROOMS.forEach((r, ri) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[y * W + x] = 0; room[y * W + x] = ri; }
  });
  for (const [x, y] of DOORS) { grid[y * W + x] = 0; room[y * W + x] = 3; }
  const furn = FURN_DEF.map((d, fi) => {
    const f = { ...d, items: [] };
    for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { grid[y * W + x] = 2; furnAt[y * W + x] = fi; }
    if (d.pool) {
      for (let j = 0; j < d.cap; j++) if (d.k === "fridge" || rnd() < 0.72) f.items.push(pick(POOLS[d.pool], rnd));
      // the deep freezer usually holds the legendary turkey
      if (d.k === "freezer" && rnd() < 0.75) f.items[0] = "turkey";
    }
    return f;
  });
  const creaky = new Set();
  const n = night - 1;
  for (let i = 0; i < W * H; i++) {
    if (grid[i] !== 0) continue;
    const ri = room[i];
    const fl = ROOMS[ri]?.floor;
    const ch = fl === "wood" ? 0.13 + 0.035 * n : fl === "carpet" ? 0.03 : fl === "concrete" ? 0.0 : 0.06 + 0.02 * n;
    if (rnd() < ch) creaky.add(i);
  }
  // keep the very first steps out of bed fair
  for (const [x, y] of [[7, 5], [7, 6], [6, 5], [8, 5], [7, 7]]) creaky.delete(y * W + x);
  return { grid, room, furnAt, furn, creaky };
}

export const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const walk = (h, x, y) => inB(x, y) && h.grid[y * W + x] === 0;
export const isWall = (h, x, y) => !inB(x, y) || h.grid[y * W + x] === 1;

export function roomOf(h, x, y) {
  const i = Math.floor(y) * W + Math.floor(x);
  const r = h.room[i];
  return r >= 0 ? ROOMS[r] : null;
}

// walls block sight and light; furniture is low and doesn't
export function los(h, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), n = Math.ceil(d * 3);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  for (let i = 1; i < n; i++) {
    const x = Math.floor(x0 + dx * i / n), y = Math.floor(y0 + dy * i / n);
    if (x === ex && y === ey) continue;
    if (isWall(h, x, y)) return false;
  }
  return true;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const Q = new Int16Array(W * H);

export function bfs(h, sx, sy, max = 999) {
  const dist = new Int16Array(W * H).fill(-1);
  if (!walk(h, sx, sy)) return dist;
  let qh = 0, qt = 0;
  dist[sy * W + sx] = 0; Q[qt++] = sy * W + sx;
  while (qh < qt) {
    const i = Q[qh++], x = i % W, y = (i / W) | 0, d = dist[i];
    if (d >= max) continue;
    for (const [ax, ay] of DIRS) {
      const nx = x + ax, ny = y + ay;
      if (!walk(h, nx, ny)) continue;
      const j = ny * W + nx;
      if (dist[j] >= 0) continue;
      dist[j] = d + 1; Q[qt++] = j;
    }
  }
  return dist;
}

export function path(h, fx, fy, tx, ty) {
  const d = bfs(h, tx, ty);
  if (d[fy * W + fx] < 0) return null;
  const out = [];
  let x = fx, y = fy, guard = 0;
  while (!(x === tx && y === ty) && guard++ < 500) {
    let best = null, bd = d[y * W + x];
    for (const [ax, ay] of DIRS) {
      const nx = x + ax, ny = y + ay;
      if (!inB(nx, ny)) continue;
      const v = d[ny * W + nx];
      if (v >= 0 && v < bd) { bd = v; best = [nx, ny]; }
    }
    if (!best) break;
    [x, y] = best; out.push(best);
  }
  return out;
}

export function nearestFloor(h, x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  if (walk(h, fx, fy)) return [fx, fy];
  let best = null, bd = 1e9;
  for (let r = 1; r < 6 && !best; r++) {
    for (let yy = fy - r; yy <= fy + r; yy++) for (let xx = fx - r; xx <= fx + r; xx++) {
      if (!walk(h, xx, yy)) continue;
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (d < bd) { bd = d; best = [xx, yy]; }
    }
  }
  return best || [7, 5];
}

export function distToRect(px, py, f) {
  const cx = Math.max(f.x, Math.min(px, f.x + f.w)), cy = Math.max(f.y, Math.min(py, f.y + f.h));
  return Math.hypot(px - cx, py - cy);
}
