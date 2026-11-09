// The simulation. No DOM in here: it runs in the page and in tools/bot.mjs alike.
import { N, DAY, RES, T, F, FEAT, B, TECH, MSV, costFor, ROAD_COST, BRIDGE_COST, MARKET_BASE, stylesFor, buildTime, eraMult, TOWN_NAMES } from './data.js';

export const I = (x, y) => y * N + x;
export const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const CH = 16; // render chunk size, for dirty marking

// ---------- random ----------
export function rand(G) {
  let t = (G.rs = (G.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (G, a, b) => a + rand(G) * (b - a);
const pick = (G, arr) => arr[Math.floor(rand(G) * arr.length)];
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, s) => vnoise(x / 16, y / 16, s) * 0.55 + vnoise(x / 8, y / 8, s + 1) * 0.3 + vnoise(x / 4, y / 4, s + 2) * 0.15;

// ---------- creation ----------
export function newGame(seed = (Math.random() * 1e9) | 0) {
  const G = {
    v: 1, seed, rs: seed | 0, t: 0, nextId: 1,
    terr: new Uint8Array(N * N), feat: new Uint8Array(N * N), fv: new Uint8Array(N * N),
    road: new Uint8Array(N * N), fog: new Uint8Array(N * N), bld: new Int32Array(N * N).fill(-1),
    bridge: new Uint8Array(N * N), roadSid: new Int8Array(N * N).fill(-1), // bridge: 0 none, 1 runs along x, 2 along y
    own: new Int8Array(N * N).fill(-1),
    drops: [], campMoves: [], news: [], paper: null, market: Object.fromEntries(RES.map((k) => [k, 1])),
    buildings: [], settlements: [], units: [], tasks: [], convoys: [],
    research: { done: {}, cur: null, prog: 0 }, kh: 0,
    log: [], fx: [], dirty: new Set(), bver: 0, counts: {}, stats: { born: 0, killed: 0, hostilesKilled: 0, cleared: 0, built: 0 },
    acc: 0, won: false, alerts: [],
  };
  genMap(G);
  return G;
}

function genMap(G) {
  const s = G.seed;
  const R = () => rand(G);
  const { terr, feat, fv } = G;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = I(x, y);
    terr[i] = fbm(x, y, s + 1) > 0.6 ? T.SAND : T.DIRT;
    if (fbm(x, y, s + 7) > 0.74) terr[i] = T.TOXIC;
  }
  const sx = 30 + Math.floor(R() * 6), sy = 32 + Math.floor(R() * 6);
  G.start = [sx, sy];
  // a river from the north edge to the south edge, well east of the start
  const x0 = 76 + R() * 22, ph = R() * 6;
  for (let y = 0; y < N; y++) {
    const cx = x0 + 13 * Math.sin(y / 17 + ph) + 5 * (vnoise(y / 6, 0, s + 3) - 0.5);
    const w = 2 + (vnoise(y / 5, 3, s + 4) > 0.6 ? 1 : 0);
    for (let k = 0; k < w; k++) { const x = Math.floor(cx) + k; if (inb(x, y)) terr[I(x, y)] = T.WATER; }
  }
  // a lake somewhere far from home
  for (let tries = 0; tries < 30; tries++) {
    const lx = 10 + R() * 108, ly = 10 + R() * 108;
    if (Math.hypot(lx - sx, ly - sy) < 34) continue;
    const ra = 4 + R() * 4, rb = 3 + R() * 3;
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) {
      const X = Math.floor(lx + x), Y = Math.floor(ly + y);
      if (inb(X, Y) && (x * x) / (ra * ra) + (y * y) / (rb * rb) + (vnoise(X / 3, Y / 3, s + 9) - 0.5) * 0.6 < 1) terr[I(X, Y)] = T.WATER;
    }
    break;
  }
  // two old highways, with wrecks
  const hy = 18 + Math.floor(R() * 10) + (R() < 0.5 ? 0 : 60), vx = sx + 18 + Math.floor(R() * 14);
  for (let x = 0; x < N; x++) {
    const y = Math.floor(hy + 4 * Math.sin(x / 23));
    for (let k = 0; k < 2; k++) if (inb(x, y + k) && terr[I(x, y + k)] !== T.WATER) {
      terr[I(x, y + k)] = T.ASPHALT;
      if (R() < 0.13) feat[I(x, y + k)] = F.WRECK;
    }
  }
  for (let y = 0; y < N; y++) {
    const x = Math.floor(vx + 3 * Math.sin(y / 19));
    for (let k = 0; k < 2; k++) if (inb(x + k, y) && terr[I(x + k, y)] !== T.WATER) {
      terr[I(x + k, y)] = T.ASPHALT;
      if (R() < 0.13) feat[I(x + k, y)] = F.WRECK;
    }
  }
  // dead cities: a street grid with ruins in the blocks. One is near home.
  const cities = [[sx + 14 + R() * 4, sy - 8 + R() * 6, 9]];
  for (let k = 0; k < 4; k++) cities.push([16 + R() * 96, 16 + R() * 96, 8 + R() * 6]);
  for (const [cx, cy, cr] of cities) {
    for (let y = Math.floor(cy - cr); y <= cy + cr; y++) for (let x = Math.floor(cx - cr); x <= cx + cr; x++) {
      if (!inb(x, y)) continue;
      const i = I(x, y), d = Math.hypot(x - cx, y - cy) + (vnoise(x / 3, y / 3, s + 11) - 0.5) * 4;
      if (d > cr || terr[i] === T.WATER) continue;
      terr[i] = T.ASPHALT === terr[i] ? terr[i] : terr[i];
      const street = (((x - Math.floor(cx)) % 5) + 5) % 5 === 0 || (((y - Math.floor(cy)) % 5) + 5) % 5 === 0;
      if (street) { terr[i] = T.ASPHALT; if (R() < 0.07) feat[i] = F.WRECK; }
      else {
        if (terr[i] === T.TOXIC) terr[i] = T.DIRT;
        const r = R(), core = 1 - d / cr;
        if (r < 0.35 + core * 0.35) { feat[i] = F.RUIN; fv[i] = Math.floor(R() * 120 + core * 135); }
        else if (r < 0.8) feat[i] = F.RUBBLE;
      }
    }
  }
  // dead forests and scattered junk
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = I(x, y);
    if (terr[i] === T.WATER || terr[i] === T.TOXIC || feat[i]) continue;
    const r = R();
    if (fbm(x, y, s + 13) > 0.63 && r < 0.45) feat[i] = F.TREE;
    else if (r < 0.02) feat[i] = F.JUNK;
    else if (r < 0.04) feat[i] = F.RUBBLE;
    else if (r < 0.046) feat[i] = F.CRATER;
    else if (r < 0.056) feat[i] = F.TREE;
    else if (r < 0.06) feat[i] = F.WRECK;
    if (feat[i]) fv[i] = Math.floor(R() * 256);
  }
  // home: clear a patch and scatter the useful kind of junk around it
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const X = sx + x, Y = sy + y; if (!inb(X, Y)) continue;
    const i = I(X, Y), d = Math.hypot(x, y);
    if (d > 7.5) continue;
    if (terr[i] === T.WATER || terr[i] === T.TOXIC) terr[i] = T.DIRT;
    if (d < 4) feat[i] = F.NONE;
    else if (feat[i] === F.RUIN) feat[i] = F.RUBBLE;
    else if (!feat[i] && R() < 0.22) { feat[i] = pick(G, [F.JUNK, F.JUNK, F.TREE, F.RUBBLE, F.WRECK]); fv[i] = Math.floor(R() * 256); }
  }
  const home = addSettlement(G, 'Founders Rest', sx, sy);
  const op = addBuilding(G, 'outpost', sx, sy, home.id, true);
  for (const [type, x, y] of [['farm', sx - 4, sy + 1], ['guard', sx + 3, sy - 1]]) addBuilding(G, type, x, y, home.id, true).paid = costFor(B[type], 0, false);
  for (let k = 0; k < 5; k++) spawnPerson(G, home.id, 'civ', sx + 0.5 + rr(G, -1, 3), sy + 2.5 + rr(G, 0, 1));
  spawnPerson(G, home.id, 'sec', sx + 3.5, sy + 0.5);
  home.res = { food: 30, scrap: 45, wood: 0, stone: 0, metal: 0, glass: 0, plastic: 0 };
  revealCircle(G, sx + 1, sy + 1, 15);
  logMsg(G, 'The Planning Commission is in session. Clear debris for materials and build.', 'info', op.x, op.y);
}

function addSettlement(G, name, x, y) {
  const s = {
    id: G.settlements.length, name, ox: x, oy: y,
    res: Object.fromEntries(RES.map((k) => [k, 0])), rate: Object.fromEntries(RES.map((k) => [k, 0])),
    mutT: 75, raidT: 330, arrive: 0, starve: 0, autoRecruit: false,
    pop: 0, civ: 0, sec: 0, house: 0, bunks: 0, appeal: 0, popCap: 24, power: { sup: 0, dem: 0, ratio: 1 },
    jobs: 0, workers: 0, kh: 0, founded: G.t, siding: false, expand: 0, rally: null,
  };
  G.settlements.push(s);
  return s;
}

// ---------- tiles ----------
export function markDirty(G, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (inb(X, Y)) G.dirty.add(((Y / CH) | 0) * 100 + ((X / CH) | 0));
  }
}
export function revealCircle(G, cx, cy, r) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (!inb(x, y)) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy > r2) continue;
    const i = I(x, y);
    if (!G.fog[i]) { G.fog[i] = 1; G.dirty.add(((y / CH) | 0) * 100 + ((x / CH) | 0)); }
  }
}
// civ: settlers may cut through a building when they have to; everyone else goes around
export function passable(G, x, y, civ = false) {
  if (!inb(x, y)) return false;
  const i = I(x, y), t = G.terr[i];
  if (((t === T.WATER || t === T.TOXIC) && !G.bridge[i]) || G.feat[i] === F.RUIN) return false;
  const b = G.bld[i];
  return b < 0 || civ || B[G.buildings[b].type].walk === true;
}
const civPass = (G) => (x, y) => passable(G, x, y, true);
B.park.walk = true;

// ---------- pathfinding ----------
const gS = new Float32Array(N * N), came = new Int32Array(N * N), seen = new Uint32Array(N * N), shut = new Uint32Array(N * N);
let gen = 1;
const heap = [], heapF = [];
function hpush(i, f) {
  let k = heap.length; heap.push(i); heapF.push(f);
  while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heap[k] = heap[p]; heapF[k] = heapF[p]; k = p; }
  heap[k] = i; heapF[k] = f;
}
function hpop() {
  const top = heap[0], li = heap.pop(), lf = heapF.pop(), n = heap.length;
  if (n > 0) {
    let k = 0;
    for (;;) {
      let c = 2 * k + 1; if (c >= n) break;
      if (c + 1 < n && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lf) break;
      heap[k] = heap[c]; heapF[k] = heapF[c]; k = c;
    }
    heap[k] = li; heapF[k] = lf;
  }
  return top;
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
// goal(x,y) -> bool. pass(x,y) overrides passability (convoys bulldoze through ruins).
export function astar(G, sx, sy, goal, hx, hy, maxN = 5000, pass = null, opt = null) {
  gen++; heap.length = 0; heapF.length = 0;
  const P = pass || ((x, y) => passable(G, x, y));
  const s = I(sx, sy);
  gS[s] = 0; seen[s] = gen; came[s] = -1;
  hpush(s, Math.hypot(sx - hx, sy - hy));
  let n = 0;
  while (heap.length) {
    const c = hpop();
    if (shut[c] === gen) continue;
    shut[c] = gen;
    const cx = c % N, cy = (c / N) | 0;
    if (goal(cx, cy)) {
      const out = [];
      for (let k = c; k !== s && k >= 0; k = came[k]) out.push(k);
      return out.reverse();
    }
    if (++n > maxN) return null;
    for (const [dx, dy, w] of (opt && opt.dirs) || DIRS) {
      const x = cx + dx, y = cy + dy;
      if (!P(x, y)) continue;
      if (dx && dy && (!P(cx + dx, cy) || !P(cx, cy + dy))) continue;
      const i = I(x, y), bi = G.bld[i];
      const tc = opt && opt.cost ? opt.cost(i) : bi >= 0 && B[G.buildings[bi].type].walk !== true ? 8 : G.road[i] ? 0.6 : 1;
      const g = gS[c] + w * tc;
      if (seen[i] === gen && g >= gS[i]) continue;
      seen[i] = gen; gS[i] = g; came[i] = c;
      hpush(i, g + Math.hypot(x - hx, y - hy) * 0.6);
    }
  }
  return null;
}
function adjToRect(x, y, b) { return x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.d && !(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d); }
function goTile(G, u, tx, ty, maxN) {
  const sx = Math.floor(u.x), sy = Math.floor(u.y);
  const civ = u.kind === 'civ', exact = passable(G, tx, ty, civ);
  u.fin = null;
  const goal = exact ? (x, y) => x === tx && y === ty : (x, y) => Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1;
  if (goal(sx, sy)) { u.path = null; return true; }
  u.path = astar(G, sx, sy, goal, tx, ty, maxN, civ ? civPass(G) : null); u.pi = 0;
  return !!u.path;
}
// the front door is on the +y face, in the middle
export const doorOf = (b) => ({ tx: b.x + (b.w >> 1), ty: b.y + b.d, px: b.x + (b.w >> 1) + 0.5, py: b.y + b.d - 0.08 });
function goBuilding(G, u, b, useDoor = true) {
  const sx = Math.floor(u.x), sy = Math.floor(u.y), civ = u.kind === 'civ', pass = civ ? civPass(G) : null;
  u.fin = null;
  if (useDoor && civ) { // settlers use the door: walk to the step, then in through it
    const d = doorOf(b);
    if (sx === d.tx && sy === d.ty) { u.path = []; u.pi = 0; u.fin = [d.px, d.py]; return true; }
    if (passable(G, d.tx, d.ty)) {
      const p = astar(G, sx, sy, (x, y) => x === d.tx && y === d.ty, d.tx, d.ty, 5000, pass);
      if (p) { u.path = p; u.pi = 0; u.fin = [d.px, d.py]; return true; }
    }
  }
  if (adjToRect(sx, sy, b)) { u.path = null; return true; }
  u.path = astar(G, sx, sy, (x, y) => adjToRect(x, y, b), b.x + b.w / 2, b.y + b.d / 2, 5000, pass); u.pi = 0;
  return !!u.path;
}
function follow(G, u, spd, dt) {
  if (!u.path) return true;
  const ti = I(Math.floor(u.x), Math.floor(u.y));
  let step = spd * dt * (G.road[ti] ? 1.4 : 1);
  while (step > 0 && u.pi < u.path.length) {
    const p = u.path[u.pi], tx = (p % N) + 0.5, ty = ((p / N) | 0) + 0.5;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d > 0.01) u.fx = dx / d, u.fy = dy / d;
    if (d <= step) { u.x = tx; u.y = ty; step -= d; u.pi++; }
    else { u.x += (dx / d) * step; u.y += (dy / d) * step; step = 0; }
  }
  u.walk = (u.walk || 0) + spd * dt;
  if (u.pi >= u.path.length) {
    if (u.fin) { // the last step, through the door
      const dx = u.fin[0] - u.x, dy = u.fin[1] - u.y, d = Math.hypot(dx, dy), m = spd * dt;
      if (d > m + 0.01) { u.x += (dx / d) * m; u.y += (dy / d) * m; return false; }
      u.x = u.fin[0]; u.y = u.fin[1]; u.fin = null;
    }
    u.path = null; return true;
  }
  return false;
}

// ---------- buildings ----------
export function settlementOf(G, x, y) { return inb(x, y) ? G.own[I(x, y)] : -1; }
function recomputeOwn(G) {
  G.own.fill(-1);
  const best = new Float32Array(N * N).fill(1e9);
  const stamp = (cx, cy, r, sid) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      const i = I(x, y);
      if (d < best[i]) { best[i] = d; G.own[i] = sid; }
    }
  };
  for (const b of G.buildings) {
    if (b.dead) continue;
    const def = B[b.type];
    if (def.limit === 0) continue;
    stamp(b.x + b.w / 2, b.y + b.d / 2, b.type === 'outpost' ? 13 : def.limit || 9 + Math.max(b.w, b.d) / 2, b.sid);
  }
  for (let i = 0; i < N * N; i++) if (G.road[i] && G.roadSid[i] >= 0) stamp((i % N) + 0.5, ((i / N) | 0) + 0.5, 4.5, G.roadSid[i]);
  // towns that ran out of debris have been granted extra rings of land
  const dist = new Int16Array(N * N).fill(-1), q = [];
  for (let i = 0; i < N * N; i++) if (G.own[i] >= 0) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], s = G.settlements[G.own[c]];
    if (dist[c] >= ((s && s.expand) || 0)) continue;
    const cx = c % N, cy = (c / N) | 0;
    for (const [dx, dy] of DIRS) {
      const x = cx + dx, y = cy + dy;
      if (!inb(x, y)) continue;
      const i = I(x, y);
      if (dist[i] >= 0) continue;
      dist[i] = dist[c] + 1; G.own[i] = G.own[c]; q.push(i);
    }
  }
}
// when a town has no debris left inside its limits it is granted one more ring, and another, until there is some
function checkExpand(G, s) {
  const has = () => { for (let i = 0; i < N * N; i++) if (G.own[i] === s.id && G.feat[i]) return true; return false; };
  if (has()) return;
  const count = () => { let n = 0; for (let i = 0; i < N * N; i++) if (G.own[i] === s.id) n++; return n; };
  let before = count(), grew = false;
  for (let k = 0; k < N * 2; k++) {
    s.expand++;
    recomputeOwn(G);
    const now = count();
    if (now === before) { s.expand--; recomputeOwn(G); break; } // the map is covered
    before = now; grew = true;
    if (has()) break;
  }
  if (!grew) return;
  for (let i = 0; i < N * N; i++) if (G.own[i] === s.id && !G.fog[i]) { G.fog[i] = 1; markDirty(G, i % N, (i / N) | 0); }
  logMsg(G, `${s.name} has cleared its land. The Commission extends the town limits.`, 'good');
}
function buildingsChanged(G) {
  G.bver++;
  recomputeOwn(G);
  const c = {};
  for (const id in B) c[id] = 0;
  for (const b of G.buildings) if (!b.dead && b.built) c[b.type]++;
  G.counts = c;
  for (const s of G.settlements) s.blds = G.buildings.filter((b) => !b.dead && b.sid === s.id);
}
// road access reaches three squares from any road tile
function roadAdj(G, b) {
  for (let y = b.y - 3; y < b.y + b.d + 3; y++) for (let x = b.x - 3; x < b.x + b.w + 3; x++) if (inb(x, y) && G.road[I(x, y)]) return true;
  return false;
}
export function eraNow(G) { const d = G.research.done; return d.reconstruction ? 2 : d.carpentry ? 1 : 0; }
export function sidingNow(G, s) {
  return !!G.research.done.petro && s.blds && s.blds.some((b) => b.type === 'refinery' && b.built && b.staff > 0);
}
function addBuilding(G, type, x, y, sid, built) {
  const def = B[type], [w, d] = def.size;
  const s = G.settlements[sid];
  const b = {
    id: G.buildings.length, type, x, y, w, d, sid, era: eraNow(G), siding: s.blds ? sidingNow(G, s) : false,
    hue: Math.floor(rand(G) * 6), built: !!built, staff: 0, workers: 0, eff: 0, dead: false, at: G.t,
    maxJobs: null, maxCrew: null, snipers: type === 'guard' ? 1 : 0, move: null,
  };
  G.buildings.push(b);
  for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = I(xx, yy);
    G.bld[i] = b.id; G.road[i] = 0; markDirty(G, xx, yy);
  }
  if (built) { for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) G.feat[I(xx, yy)] = 0; revealCircle(G, x + w / 2, y + d / 2, def.reveal || 8); }
  buildingsChanged(G);
  for (const o of G.buildings) if (!o.dead) o.road = roadAdj(G, o);
  return b;
}

// style: 0-3 from stylesFor(), or null for the newest
export function canPlace(G, type, x, y, sid = null, style = null) {
  const def = B[type];
  if (!def) return { ok: false, reason: 'Unknown building' };
  if (def.tech && !G.research.done[def.tech]) return { ok: false, reason: `Needs ${TECH[def.tech].name}` };
  if (def.unique) return { ok: false, reason: 'Only an MSV can found an outpost' };
  const [w, d] = def.size;
  let own = null, ruin = false;
  for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) {
    if (!inb(xx, yy)) return { ok: false, reason: 'Off the map' };
    const i = I(xx, yy);
    if (!G.fog[i]) return { ok: false, reason: 'Unexplored' };
    if (G.terr[i] === T.WATER) return { ok: false, reason: 'Water' };
    if (G.terr[i] === T.TOXIC) return { ok: false, reason: 'Toxic sludge' };
    if (G.bld[i] >= 0) return { ok: false, reason: 'Occupied' };
    if (G.feat[i] === F.RUIN) ruin = true;
    const o = G.own[i];
    if (o < 0) return { ok: false, reason: 'Outside town limits' };
    if (own === null) own = o; else if (o !== own) return { ok: false, reason: 'Straddles two towns' };
  }
  if (ruin) return { ok: false, reason: 'Clear the ruins first' };
  if (sid !== null && own !== sid) return { ok: false, reason: 'Outside town limits' };
  const s = G.settlements[own], nowEra = eraNow(G), nowSd = sidingNow(G, s);
  let era = nowEra, siding = nowSd;
  if (style != null && !def.noEra) {
    if (!stylesFor(def, nowEra, nowSd).includes(style)) return { ok: false, reason: 'That style is not available', sid: own };
    era = Math.min(style, 2); siding = style === 3;
  }
  const cost = costFor(def, era, siding);
  for (const k in cost) if ((s.res[k] || 0) < cost[k]) return { ok: false, reason: `Not enough ${k}`, cost, sid: own, era, siding };
  return { ok: true, cost, sid: own, era, siding };
}
export function placeBuilding(G, type, x, y, sid = null, style = null) {
  const r = canPlace(G, type, x, y, sid, style);
  if (!r.ok) return r;
  const s = G.settlements[r.sid];
  for (const k in r.cost) s.res[k] -= r.cost[k];
  const b = addBuilding(G, type, x, y, r.sid, false);
  b.paid = r.cost; b.era = r.era; b.siding = r.siding;
  let need = buildTime(B[type]), yld = {};
  for (let yy = y; yy < y + b.d; yy++) for (let xx = x; xx < x + b.w; xx++) {
    const f = G.feat[I(xx, yy)];
    if (f) { need += FEAT[f].t * 0.6; for (const k in FEAT[f].yield) yld[k] = (yld[k] || 0) + FEAT[f].yield[k]; }
  }
  addTask(G, { kind: 'build', sid: r.sid, bid: b.id, x: b.x, y: b.y, need, max: Math.min(4, 1 + b.w), yield: yld });
  return { ok: true, b };
}
const isWet = (G, i) => G.terr[i] === T.WATER || G.terr[i] === T.TOXIC;
// axis: which way the drag runs here (1 along x, 2 along y), for bridges
export function canRoad(G, x, y, axis = 0) {
  if (!inb(x, y)) return { ok: false };
  const i = I(x, y), era = eraNow(G), old = G.road[i], wet = isWet(G, i);
  if (old && old - 1 >= era) return { ok: false, reason: 'Already a road' };
  if (!G.fog[i] || G.own[i] < 0) return { ok: false, reason: 'Outside town limits' };
  if (G.bld[i] >= 0) return { ok: false, reason: 'Occupied' };
  if (G.feat[i] === F.RUIN) return { ok: false, reason: 'Clear the ruins first' };
  const near = (dx, dy) => (inb(x + dx, y + dy) ? I(x + dx, y + dy) : -1);
  let ax = G.bridge[i] || axis;
  if (wet) {
    if (!ax) { const a = near(0, 1), b = near(0, -1), c = near(1, 0), d = near(-1, 0), rd = (k) => k >= 0 && G.road[k]; ax = (rd(a) || rd(b)) && !(rd(c) || rd(d)) ? 2 : 1; }
    const other = ax === 1 ? 2 : 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = near(dx, dy); if (k >= 0 && G.bridge[k] === other) return { ok: false, reason: 'Bridges cannot have junctions' }; }
  }
  const s = G.settlements[G.own[i]], cost = (wet ? BRIDGE_COST : ROAD_COST)[era];
  for (const k in cost) if (s.res[k] < cost[k]) return { ok: false, reason: `Not enough ${k}` };
  return { ok: true, cost, sid: s.id, axis: ax, upgrade: !!old };
}
export function placeRoad(G, x, y, axis = 0) {
  const r = canRoad(G, x, y, axis);
  if (!r.ok) return r;
  const s = G.settlements[r.sid], i = I(x, y), old = G.road[i];
  for (const k in r.cost) s.res[k] -= r.cost[k];
  if (old) { const was = (G.bridge[i] ? BRIDGE_COST : ROAD_COST)[old - 1]; for (const k in was) s.res[k] += was[k] * 0.3; } // the old surface is salvaged at 30%
  setRoad(G, x, y, eraNow(G), r.sid, r.axis);
  return r;
}
function setRoad(G, x, y, era, sid, axis = 0) {
  const i = I(x, y);
  G.road[i] = 1 + era; G.feat[i] = 0; G.roadSid[i] = sid; G.bridge[i] = isWet(G, i) ? axis || 1 : 0;
  markDirty(G, x, y);
  revealCircle(G, x + 0.5, y + 0.5, 6);
  for (const t of G.tasks) if (t.kind === 'clear' && t.x === x && t.y === y) t.dead = true;
  for (const b of G.buildings) if (!b.dead && Math.abs(b.x - x) < 10 && Math.abs(b.y - y) < 10) b.road = roadAdj(G, b);
  recomputeOwn(G);
}
export function demolish(G, bid) {
  const b = G.buildings[bid];
  if (!b || b.dead) return { ok: false, reason: 'Nothing there' };
  if (b.type === 'outpost') return { ok: false, reason: 'The Commission does not demolish itself' };
  if (b.move) return { ok: false, reason: 'That camp is on the move' };
  const s = G.settlements[b.sid];
  const refund = b.built ? 0.5 : 0.8;
  for (const k in b.paid || {}) s.res[k] += Math.ceil(b.paid[k] * refund); // wood and everything else it cost
  b.dead = true;
  for (let yy = b.y; yy < b.y + b.d; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { G.bld[I(xx, yy)] = -1; markDirty(G, xx, yy); }
  for (const t of G.tasks) if (t.bid === bid) t.dead = true;
  for (const u of G.units) {
    if (u.job === bid) u.job = -1;
    if (u.home === bid) u.home = -1;
    if (u.post === bid) u.post = -1;
    if (u.hidden && u.in === bid) u.hidden = false;
  }
  buildingsChanged(G);
  return { ok: true };
}
export function demolishRoad(G, x, y) {
  if (!inb(x, y) || !G.road[I(x, y)]) return { ok: false };
  const i = I(x, y);
  G.road[i] = 0; G.bridge[i] = 0; G.roadSid[i] = -1; markDirty(G, x, y);
  for (const b of G.buildings) if (!b.dead && Math.abs(b.x - x) < 10 && Math.abs(b.y - y) < 10) b.road = roadAdj(G, b);
  recomputeOwn(G);
  return { ok: true };
}

// ---------- tasks ----------
function addTask(G, t) { t.id = G.nextId++; t.prog = 0; t.n = 0; G.tasks.push(t); return t; }
export function queueClear(G, x0, y0, x1, y1) {
  let n = 0;
  const have = new Set(G.tasks.filter((t) => t.kind === 'clear' && !t.dead).map((t) => I(t.x, t.y)));
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inb(x, y)) continue;
    const i = I(x, y), f = G.feat[i];
    if (!f || !G.fog[i] || G.own[i] < 0 || G.bld[i] >= 0 || have.has(i)) continue;
    addTask(G, { kind: 'clear', sid: G.own[i], x, y, need: FEAT[f].t, max: 1, yield: FEAT[f].yield });
    n++;
  }
  return { ok: n > 0, n, reason: n ? '' : 'No debris there in town limits' };
}
export function cancelClear(G, x0, y0, x1, y1) {
  let n = 0;
  for (const t of G.tasks) if (t.kind === 'clear' && !t.dead && t.x >= Math.min(x0, x1) && t.x <= Math.max(x0, x1) && t.y >= Math.min(y0, y1) && t.y <= Math.max(y0, y1)) { t.dead = true; n++; }
  return { ok: n > 0, n };
}
export function renovate(G, bid) {
  const b = G.buildings[bid];
  if (!b || b.dead || !b.built) return { ok: false, reason: 'Not a finished building' };
  const s = G.settlements[b.sid], era = eraNow(G), sid = sidingNow(G, s);
  if (B[b.type].noEra) return { ok: false, reason: 'Tents are tents' };
  if (b.reno) return { ok: false, reason: 'Already being renovated' };
  if (b.era > era || (b.era === era && (b.siding || !sid))) return { ok: false, reason: 'Already up to date' };
  const def = B[b.type];
  if (!def.c) { // the outpost renovates for free; it is the Commission's own office
    addTask(G, { kind: 'reno', sid: s.id, bid, x: b.x, y: b.y, need: 14, max: 3, era, siding: sid });
    b.reno = true; return { ok: true };
  }
  const full = costFor({ c: def.c }, era, sid), cost = {};
  for (const k in full) cost[k] = Math.ceil(full[k] * 0.6);
  for (const k in cost) if (s.res[k] < cost[k]) return { ok: false, reason: `Not enough ${k}`, cost };
  for (const k in cost) { s.res[k] -= cost[k]; (b.paid = b.paid || {})[k] = (b.paid[k] || 0) + cost[k]; }
  addTask(G, { kind: 'reno', sid: s.id, bid, x: b.x, y: b.y, need: buildTime(def) * 0.6, max: 3, era, siding: sid });
  b.reno = true;
  return { ok: true, cost };
}
export function renoCost(G, b) {
  const def = B[b.type], s = G.settlements[b.sid];
  if (!def.c) return {};
  const full = costFor({ c: def.c }, eraNow(G), sidingNow(G, s)), cost = {};
  for (const k in full) cost[k] = Math.ceil(full[k] * 0.6);
  return cost;
}
export function needsReno(G, b) {
  if (!b.built || b.dead || b.reno || B[b.type].noEra) return false;
  const era = eraNow(G), sd = sidingNow(G, G.settlements[b.sid]);
  return b.era < era || (b.era === era && sd && !b.siding);
}
function completeTask(G, t) {
  t.dead = true;
  const s = G.settlements[t.sid];
  if (t.kind === 'clear') {
    const i = I(t.x, t.y);
    if (G.feat[i]) { for (const k in t.yield) s.res[k] += t.yield[k]; G.stats.cleared++; }
    G.feat[i] = 0; markDirty(G, t.x, t.y);
    G.fx.push({ k: 'dust', x: t.x + 0.5, y: t.y + 0.5, t: G.t, d: 0.8 });
  } else if (t.kind === 'build') {
    const b = G.buildings[t.bid];
    if (!b || b.dead) return;
    for (const k in t.yield) s.res[k] += t.yield[k];
    for (let yy = b.y; yy < b.y + b.d; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { G.feat[I(xx, yy)] = 0; markDirty(G, xx, yy); }
    b.built = true; b.at = G.t; G.stats.built++;
    revealCircle(G, b.x + b.w / 2, b.y + b.d / 2, B[b.type].reveal || 8);
    buildingsChanged(G);
    G.alerts.push({ k: 'built', bid: b.id });
    if (G.counts[b.type] === 1 && B[b.type].tech) G.news.push({ k: 'first', type: b.type });
    if (b.type === 'refinery' && G.research.done.petro) logMsg(G, `${s.name} has a Plastic Refinery. New buildings get vinyl siding.`, 'good', b.x, b.y);
  } else if (t.kind === 'loot') {
    const at = G.drops.findIndex((d) => d.id === t.drop);
    if (at >= 0) { const d = G.drops[at]; for (const k in d.res) s.res[k] += d.res[k]; G.drops.splice(at, 1); G.stats.looted = (G.stats.looted || 0) + 1; }
  } else if (t.kind === 'reno') {
    const b = G.buildings[t.bid];
    if (!b || b.dead) return;
    b.era = t.era; b.siding = t.siding; b.reno = false; b.at = G.t;
    G.alerts.push({ k: 'reno', bid: b.id });
  }
}

// ---------- people ----------
function spawnPerson(G, sid, kind, x, y) {
  const u = {
    id: G.nextId++, kind, sid, x, y, hp: kind === 'civ' ? 10 : 60, max: kind === 'civ' ? 10 : 60,
    st: 'idle', timer: rr(G, 0, 2), think: rand(G), path: null, pi: 0, job: -1, home: -1, post: -1, crew: false, task: -1,
    hidden: false, in: -1, col: Math.floor(rand(G) * 8), cd: 0, fx: 1, fy: 0, walk: 0, calm: 0,
  };
  G.units.push(u);
  return u;
}
function spawnHostile(G, kind, x, y, sid) {
  const u = {
    id: G.nextId++, kind, sid, x: x + 0.5, y: y + 0.5, hp: kind === 'mutant' ? 35 : 36, max: kind === 'mutant' ? 35 : 36,
    st: 'come', timer: 0, think: rand(G), path: null, pi: 0, target: -1, cd: 0, fx: 1, fy: 0, walk: 0,
    hx: x, hy: y, loot: null, col: Math.floor(rand(G) * 4), repath: 0,
  };
  G.units.push(u);
  return u;
}
const isHostile = (u) => u.kind === 'mutant' || u.kind === 'raider';
function nearest(G, x, y, r, fn) {
  let best = null, bd = r * r;
  for (const o of G.units) {
    if (o.hp <= 0 || o.hidden || !fn(o)) continue;
    const dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function outpostOf(G, sid) { return G.settlements[sid].blds.find((b) => b.type === 'outpost'); }
function releaseTask(G, u) {
  if (u.task >= 0) { const t = G.tasks.find((t) => t.id === u.task); if (t) t.n = Math.max(0, t.n - 1); }
  u.task = -1;
}
function hide(u, bid) { u.hidden = true; u.in = bid; u.path = null; u.fin = null; }
function unhide(u) { u.hidden = false; u.in = -1; }

function civThink(G, u, dt) {
  const s = G.settlements[u.sid];
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.35 + rand(G) * 0.2;
    if (!u.hidden && u.st !== 'flee') {
      const h = nearest(G, u.x, u.y, 6, isHostile);
      if (h) {
        releaseTask(G, u);
        const op = outpostOf(G, u.sid);
        const shelter = op && Math.hypot(op.x + 1 - u.x, op.y + 1 - u.y) < 30 ? op : null;
        u.st = 'flee'; u.timer = 0;
        if (!(shelter && goBuilding(G, u, shelter))) {
          const ax = u.x - h.x, ay = u.y - h.y, d = Math.hypot(ax, ay) || 1;
          goTile(G, u, Math.floor(u.x + (ax / d) * 6), Math.floor(u.y + (ay / d) * 6), 600);
        }
        u.flee = shelter ? shelter.id : -1;
      }
    }
  }
  switch (u.st) {
    case 'flee':
      if (follow(G, u, 1.75, dt)) {
        if (u.flee >= 0) { hide(u, u.flee); u.st = 'shelter'; u.timer = 4; }
        else { u.st = 'idle'; u.timer = 1; }
      }
      return;
    case 'shelter':
      u.timer -= dt;
      if (u.timer <= 0) {
        if (nearest(G, u.x, u.y, 9, isHostile)) u.timer = 2.5;
        else { unhide(u); u.st = 'idle'; u.timer = 0; }
      }
      return;
  }
  if (u.crew) return crewLogic(G, u, dt, s);
  jobLogic(G, u, dt, s);
}
function amenity(G, s) {
  const am = s.blds.filter((b) => b.built && (b.type === 'park' || b.type === 'store' || b.type === 'stall' || b.type === 'mall' || b.type === 'clinic' || b.type === 'newspaper'));
  return am.length ? pick(G, am) : null;
}
function wanderNear(G, u, cx, cy, r) {
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(cx + rr(G, -r, r)), y = Math.floor(cy + rr(G, -r, r));
    if (passable(G, x, y) && goTile(G, u, x, y, 800)) return true;
  }
  return false;
}
function jobLogic(G, u, dt, s) {
  const job = u.job >= 0 ? G.buildings[u.job] : null;
  const home = u.home >= 0 ? G.buildings[u.home] : null;
  u.timer -= dt;
  switch (u.st) {
    case 'idle':
      if (u.timer > 0) return;
      if (u.hidden) unhide(u);
      if (job && goBuilding(G, u, job)) { u.st = 'toWork'; return; }
      if (home && goBuilding(G, u, home)) { u.st = 'toHome'; return; }
      { const op = outpostOf(G, u.sid); if (op) wanderNear(G, u, op.x + 1, op.y + 1, 4); }
      u.st = 'stroll'; return;
    case 'stroll':
      if (follow(G, u, 0.9, dt)) { u.st = 'idle'; u.timer = rr(G, 2, 6); }
      return;
    case 'toWork':
      if (!job) { u.st = 'idle'; return; }
      if (follow(G, u, 1.1, dt)) { hide(u, job.id); u.st = 'work'; u.timer = rr(G, 12, 26); }
      return;
    case 'work':
      if (u.timer > 0) return;
      unhide(u);
      if (rand(G) < 0.35) {
        const a = amenity(G, s);
        if (a && goBuilding(G, u, a)) { u.st = 'errand'; u.dest = a.id; return; }
      }
      if (home && goBuilding(G, u, home)) { u.st = 'toHome'; return; }
      u.st = 'idle'; u.timer = rr(G, 1, 3); return;
    case 'errand': {
      if (!follow(G, u, 1.0, dt)) return;
      const a = G.buildings[u.dest];
      if (a && !a.dead && a.type === 'park') {
        u.st = 'park'; u.timer = rr(G, 8, 16);
        goTile(G, u, a.x + Math.floor(rand(G) * a.w), a.y + Math.floor(rand(G) * a.d), 200);
      } else if (a && !a.dead) { hide(u, a.id); u.st = 'shop'; u.timer = rr(G, 5, 9); }
      else u.st = 'idle';
      return;
    }
    case 'park':
      follow(G, u, 0.6, dt);
      if (u.timer <= 0) { u.st = 'toHome'; if (!(home && goBuilding(G, u, home))) u.st = 'idle'; }
      else if (!u.path && rand(G) < dt * 0.3) { const a = G.buildings[u.dest]; if (a) goTile(G, u, a.x + Math.floor(rand(G) * a.w), a.y + Math.floor(rand(G) * a.d), 100); }
      return;
    case 'shop':
      if (u.timer <= 0) { unhide(u); u.st = 'toHome'; if (!(home && goBuilding(G, u, home))) u.st = 'idle'; }
      return;
    case 'toHome':
      if (follow(G, u, 1.1, dt)) { if (home) hide(u, home.id); u.st = 'home'; u.timer = rr(G, 5, 12); }
      return;
    case 'home':
      if (u.timer <= 0) { u.st = 'idle'; u.timer = 0; }
      return;
    default:
      u.st = 'idle';
  }
}
function taskGoal(G, u, t) {
  if (t.kind === 'clear' || t.kind === 'loot') return goTile(G, u, t.x, t.y, 2500);
  const b = G.buildings[t.bid];
  return b && goBuilding(G, u, b, false);
}
function findTask(G, u) {
  let best = null, bs = 1e9;
  for (const t of G.tasks) {
    if (t.dead || t.sid !== u.sid || t.n >= t.max || t.fail > G.t) continue;
    const d = Math.hypot(t.x + 0.5 - u.x, t.y + 0.5 - u.y) + (t.kind === 'clear' ? 14 : t.kind === 'loot' ? 4 : 0) + t.n * 3;
    if (d < bs) { bs = d; best = t; }
  }
  return best;
}
function crewLogic(G, u, dt, s) {
  let t = u.task >= 0 ? G.tasks.find((k) => k.id === u.task) : null;
  if (t && t.dead) { u.task = -1; t = null; if (u.st === 'toTask' || u.st === 'working') { u.st = 'idle'; u.timer = 0.3; } }
  u.timer -= dt;
  if (!t && (u.st === 'idle' || u.st === 'loiter' || u.st === 'rest')) {
    if (u.timer > 0 && u.st !== 'loiter') return;
    if (u.st === 'loiter' && !follow(G, u, 0.9, dt) && u.timer > 0) return;
    const nt = findTask(G, u);
    if (nt) {
      if (u.hidden) unhide(u);
      if (taskGoal(G, u, nt)) { nt.n++; u.task = nt.id; u.st = 'toTask'; return; }
      nt.fail = G.t + 8; // unreachable for now; let someone else try later
    }
    if (u.timer <= 0) {
      const op = outpostOf(G, u.sid);
      if (u.hidden) { unhide(u); }
      if (op && rand(G) < 0.5) { if (goBuilding(G, u, op)) { u.st = 'rest'; u.timer = 0; u.resting = op.id; return; } }
      if (op) wanderNear(G, u, op.x + 1, op.y + 1, 5);
      u.st = 'loiter'; u.timer = rr(G, 3, 7);
    }
    if (u.st === 'rest' && follow(G, u, 1, dt) && !u.hidden) { hide(u, u.resting); u.timer = rr(G, 3, 6); u.st = 'idle'; }
    return;
  }
  if (u.st === 'rest') { if (follow(G, u, 1, dt)) { hide(u, u.resting); u.timer = rr(G, 3, 6); u.st = 'idle'; } return; }
  if (!t) { u.st = 'idle'; return; }
  if (u.st === 'toTask') {
    if (follow(G, u, 1.15, dt)) u.st = 'working';
    return;
  }
  if (u.st === 'working') {
    t.prog += dt;
    u.walk += dt * 3;
    if (t.prog >= t.need) {
      completeTask(G, t);
      for (const o of G.units) if (o.task === t.id) { o.task = -1; o.st = 'idle'; o.timer = 0.2; }
    }
    return;
  }
  u.st = 'idle';
}

function sniperThink(G, u, post, dt) {
  if (u.in !== post.id) { // climb the tower first
    if (!u.path && !u.fin && !goBuilding(G, u, post)) return;
    if (follow(G, u, 1.3, dt)) hide(u, post.id);
    return;
  }
  if (u.think > 0) return;
  u.think = 0.3;
  const cx = post.x + 0.5, cy = post.y + 0.5;
  const t = nearest(G, cx, cy, 15, (o) => isHostile(o) && G.fog[I(Math.floor(o.x), Math.floor(o.y))]);
  if (!t || u.cd > 0) return;
  u.cd = 2.4;
  const hit = rand(G) < 0.75;
  G.fx.push({ k: 'shot', x: cx, y: cy, z: 27, x2: t.x + (hit ? 0 : rr(G, -1, 1)), y2: t.y + (hit ? 0 : rr(G, -1, 1)), t: G.t, d: 0.14, c: 0 });
  if (hit) damage(G, t, 16, u);
}
function secThink(G, u, dt) {
  u.think -= dt; u.cd -= dt; u.calm += dt;
  const post = u.post >= 0 ? G.buildings[u.post] : outpostOf(G, u.sid);
  if (post && post.move && post.move.ph === 'travel') return; // on the road with the camp
  if (u.sniper && post && post.type === 'guard' && post.built) return sniperThink(G, u, post, dt);
  const town = G.settlements[u.sid];
  if (u.think <= 0) {
    u.think = 0.3;
    const px = post ? post.x + post.w / 2 : u.x, py = post ? post.y + post.d / 2 : u.y;
    let t = u.target >= 0 ? G.units.find((o) => o.id === u.target && o.hp > 0) : null;
    if (t && Math.hypot(t.x - u.x, t.y - u.y) > 26) t = null;
    if (!t) {
      t = nearest(G, u.x, u.y, 20, isHostile) || nearest(G, px, py, 14, isHostile);
      if (!t) { // anyone being hurt nearby in town limits?
        const ti = I(Math.floor(u.x), Math.floor(u.y));
        if (G.own[ti] === u.sid) t = nearestHostileInTown(G, u);
      }
    }
    u.target = t ? t.id : -1;
    if (t) {
      u.calm = 0;
      if (u.hidden) unhide(u);
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d > 5 && (u.repath -= 0.3) <= 0) { goTile(G, u, Math.floor(t.x), Math.floor(t.y), 3000); u.repath = 1.2; u.st = 'chase'; }
    }
  }
  const t = u.target >= 0 ? G.units.find((o) => o.id === u.target) : null;
  if (t && t.hp > 0) {
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    if (d <= 5.5) {
      u.path = null;
      u.fx = (t.x - u.x) / (d || 1); u.fy = (t.y - u.y) / (d || 1);
      if (u.cd <= 0) {
        u.cd = 1.0;
        const hit = rand(G) < 0.8;
        G.fx.push({ k: 'shot', x: u.x, y: u.y, x2: t.x + (hit ? 0 : rr(G, -1, 1)), y2: t.y + (hit ? 0 : rr(G, -1, 1)), t: G.t, d: 0.12, c: 0 });
        if (hit) damage(G, t, 10, u);
      }
    } else follow(G, u, 1.4, dt);
    return;
  }
  // patrol
  const clinic = G.settlements[u.sid].blds.some((b) => b.type === 'clinic' && b.built);
  if (u.calm > 4 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + dt * (clinic ? 4 : 2));
  u.timer -= dt;
  if (u.st === 'chase') { u.st = 'patrol'; u.path = null; }
  if (u.hidden) { if (u.timer <= 0) { unhide(u); u.timer = 0; } return; }
  if (!follow(G, u, town.rally ? 1.3 : 0.9, dt)) return;
  if (u.timer > 0) return;
  if (town.rally) { // muster at the rally point
    const far = Math.hypot(town.rally.x + 0.5 - u.x, town.rally.y + 0.5 - u.y) > 5;
    if (far) goTile(G, u, town.rally.x, town.rally.y, 6000); else wanderNear(G, u, town.rally.x + 0.5, town.rally.y + 0.5, 4);
    u.st = 'patrol'; u.timer = far ? 0.5 : rr(G, 1, 4);
    return;
  }
  if (post && rand(G) < 0.25 && goBuilding(G, u, post)) { u.st = 'toPost'; u.timer = 0; return; }
  if (u.st === 'toPost' && post) { hide(u, post.id); u.st = 'patrol'; u.timer = rr(G, 3, 8); return; }
  if (post) wanderNear(G, u, post.x + post.w / 2, post.y + post.d / 2, 5);
  u.st = 'patrol'; u.timer = rr(G, 2, 6);
}
function nearestHostileInTown(G, u) {
  let best = null, bd = 1e9;
  for (const o of G.units) {
    if (!isHostile(o) || o.hp <= 0) continue;
    const i = I(Math.floor(o.x), Math.floor(o.y));
    if (!inb(Math.floor(o.x), Math.floor(o.y)) || G.own[i] !== u.sid) continue;
    const d = Math.hypot(o.x - u.x, o.y - u.y);
    if (d < bd && d < 30) { bd = d; best = o; }
  }
  return best;
}
function damage(G, t, n, by) {
  t.hp -= n;
  if (t.kind === 'civ' || t.kind === 'sec') t.calm = 0;
  if (t.hp > 0) {
    if (isHostile(t) && by && t.target < 0) t.target = by.id;
    return;
  }
  G.fx.push({ k: 'blood', x: t.x, y: t.y, t: G.t, d: 6, c: t.kind === 'mutant' ? 1 : 0 });
  const s = G.settlements[t.sid];
  if (isHostile(t)) {
    G.stats.hostilesKilled++;
    if (t.kind === 'raider' && s) dropLoot(G, t);
  } else {
    G.stats.killed++;
    releaseTask(G, t);
    const who = t.kind === 'sec' ? 'A security officer' : 'A settler';
    const what = by && by.kind === 'raider' ? 'raiders' : 'a mutant';
    logMsg(G, `${who} of ${s.name} was killed by ${what}.`, 'bad', t.x, t.y);
  }
}
// a dead raider leaves a little of anything from any era, plus whatever it stole, for the crew to fetch
function dropLoot(G, t) {
  const res = {};
  for (let n = 1 + Math.floor(rand(G) * 3); n > 0; n--) { const k = pick(G, RES); res[k] = (res[k] || 0) + 2 + Math.floor(rand(G) * 7); }
  for (const k in t.loot || {}) res[k] = (res[k] || 0) + t.loot[k];
  const d = { id: G.nextId++, x: t.x, y: t.y, res, sid: t.sid };
  G.drops.push(d);
  addTask(G, { kind: 'loot', sid: t.sid, x: Math.floor(t.x), y: Math.floor(t.y), need: 0.8, max: 1, drop: d.id, yield: {} });
}
function hostileThink(G, u, dt) {
  u.think -= dt; u.cd -= dt;
  const mut = u.kind === 'mutant';
  const op = G.settlements[u.sid] ? outpostOf(G, u.sid) : null;
  if (u.think <= 0) {
    u.think = 0.5;
    if (!mut && u.hp < u.max * 0.35 && u.st !== 'escape') escape(G, u);
    let t = u.target >= 0 ? G.units.find((o) => o.id === u.target && o.hp > 0 && !o.hidden) : null;
    if (t && Math.hypot(t.x - u.x, t.y - u.y) > (mut ? 13 : 9)) t = null;
    if (!t && (mut || u.st !== 'escape')) {
      t = mut ? nearest(G, u.x, u.y, 10, (o) => o.kind === 'civ') || nearest(G, u.x, u.y, 6, (o) => o.kind === 'sec')
        : nearest(G, u.x, u.y, 7, (o) => o.kind === 'sec') || nearest(G, u.x, u.y, 3.5, (o) => o.kind === 'civ');
    }
    u.target = t ? t.id : -1;
    if (t) {
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d > (mut ? 0.8 : 4.5) && (u.repath -= 0.5) <= 0) { goTile(G, u, Math.floor(t.x), Math.floor(t.y), 1200); u.repath = 1; }
    } else if (!u.path) {
      if (u.st === 'escape') { goTile(G, u, u.hx, u.hy, 4000); }
      else if (op) {
        if (!mut && Math.hypot(op.x + 1 - u.x, op.y + 1 - u.y) < 2.6) {
          // the stockpile: take what can be carried and run
          const s = G.settlements[u.sid], loot = {};
          for (const k of ['food', 'scrap', 'wood', 'metal', 'glass']) { const n = Math.min(Math.floor(s.res[k] * 0.12), 12); if (n > 0) { loot[k] = n; s.res[k] -= n; } }
          u.loot = loot;
          if (Object.keys(loot).length) logMsg(G, `Raiders looted the ${s.name} stockpile!`, 'bad', u.x, u.y);
          escape(G, u);
        } else if (mut) wanderNear(G, u, op.x + 1, op.y + 1, 8);
        else goBuilding(G, u, op);
      }
    }
  }
  const t = u.target >= 0 ? G.units.find((o) => o.id === u.target) : null;
  if (t && t.hp > 0 && !t.hidden) {
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    const range = mut ? 0.8 : 4.5;
    if (d <= range) {
      u.path = null;
      u.fx = (t.x - u.x) / (d || 1); u.fy = (t.y - u.y) / (d || 1);
      if (u.cd <= 0) {
        u.cd = mut ? 1.4 : 1.5;
        if (mut) { damage(G, t, 12, u); G.fx.push({ k: 'hit', x: t.x, y: t.y, t: G.t, d: 0.25 }); }
        else {
          const hit = rand(G) < 0.5;
          G.fx.push({ k: 'shot', x: u.x, y: u.y, x2: t.x + (hit ? 0 : rr(G, -1, 1)), y2: t.y + (hit ? 0 : rr(G, -1, 1)), t: G.t, d: 0.12, c: 1 });
          if (hit) damage(G, t, 6, u);
        }
      }
      return;
    }
  }
  const spd = mut ? 0.75 : u.st === 'escape' ? 1.35 : 1.15;
  if (follow(G, u, spd, dt) && u.st === 'escape' && Math.hypot(u.x - u.hx, u.y - u.hy) < 3) u.gone = true;
}
function escape(G, u) { u.st = 'escape'; u.target = -1; u.path = null; goTile(G, u, u.hx, u.hy, 4000); }

// ---------- settlement economy ----------
const PRIO = { food: 0, power: 1, industry: 2, civic: 3, retail: 4, transport: 2, housing: 5, defense: 5 };
// research comes right after food, so a small town never stalls with its tinkers empty
const prio = (b) => (B[b.type].research ? 0.5 : PRIO[B[b.type].cat]);
function assign(G, s) {
  const civs = G.units.filter((u) => u.sid === s.id && u.kind === 'civ' && u.hp > 0);
  const secs = G.units.filter((u) => u.sid === s.id && u.kind === 'sec' && u.hp > 0);
  const built = s.blds.filter((b) => b.built);
  // jobs
  const slots = new Map();
  let crewSlots = 0;
  for (const b of built) {
    const def = B[b.type];
    if (def.crew) crewSlots += b.maxCrew == null ? def.crew : Math.min(def.crew, b.maxCrew);
    if (def.jobs) slots.set(b.id, b.maxJobs == null ? def.jobs : Math.min(def.jobs, b.maxJobs));
  }
  const order = built.filter((b) => slots.get(b.id)).sort((a, b) => prio(a) - prio(b) || a.id - b.id);
  const used = new Map(), free = [];
  let crew = 0;
  for (const u of civs) {
    if (u.crew && crew < crewSlots) { crew++; continue; }
    if (!u.crew && u.job >= 0 && slots.has(u.job) && (used.get(u.job) || 0) < slots.get(u.job)) { used.set(u.job, (used.get(u.job) || 0) + 1); continue; }
    free.push(u);
  }
  // keep a minimum crew so building never stalls, then fill jobs by priority
  const takeCrew = (u) => { if (!u.crew) { u.crew = true; u.job = -1; u.st = 'idle'; } crew++; };
  const takeJob = (u, b) => { if (u.crew) releaseTask(G, u); if (u.crew || u.job !== b.id) { u.crew = false; u.job = b.id; if (!u.hidden && u.st !== 'flee' && u.st !== 'shelter') { u.st = 'idle'; u.timer = 0; } } used.set(b.id, (used.get(b.id) || 0) + 1); };
  while (free.length && crew < Math.min(crewSlots, 2)) takeCrew(free.shift());
  for (const b of order) while (free.length && (used.get(b.id) || 0) < slots.get(b.id)) takeJob(free.shift(), b);
  // an empty food job beats a filled luxury job
  for (const b of order) {
    if (prio(b) !== 0) continue;
    while ((used.get(b.id) || 0) < slots.get(b.id)) {
      const donor = civs.find((u) => !u.crew && u.job >= 0 && G.buildings[u.job] && prio(G.buildings[u.job]) > 1);
      if (!donor) break;
      used.set(donor.job, used.get(donor.job) - 1); takeJob(donor, b);
    }
  }
  while (free.length) takeCrew(free.shift()); // everyone else swings a shovel
  for (const b of built) { b.workers = used.get(b.id) || 0; b.staff = B[b.type].jobs ? b.workers / B[b.type].jobs : 1; }
  s.jobs = [...slots.values()].reduce((a, b) => a + b, 0);
  s.workers = [...used.values()].reduce((a, b) => a + b, 0);
  s.crewN = crew; s.crewSlots = crewSlots;
  // homes
  const cap = new Map();
  for (const b of built) { const h = B[b.type].house; if (h) cap.set(b.id, Math.round(h * eraMult(b))); }
  const occ = new Map(), homeless = [];
  for (const u of civs) { if (u.home >= 0 && cap.has(u.home) && (occ.get(u.home) || 0) < cap.get(u.home)) occ.set(u.home, (occ.get(u.home) || 0) + 1); else { u.home = -1; homeless.push(u); } }
  for (const u of homeless) for (const [bid, c] of cap) if ((occ.get(bid) || 0) < c) { u.home = bid; occ.set(bid, (occ.get(bid) || 0) + 1); break; }
  s.house = [...cap.values()].reduce((a, b) => a + b, 0);
  // bunks
  const bk = new Map();
  for (const b of built) { const n = B[b.type].bunks; if (n) bk.set(b.id, Math.round(n * (b.type === 'outpost' || B[b.type].fixedBunks ? 1 : eraMult(b)))); }
  const bo = new Map();
  for (const u of secs) { if (u.post >= 0 && bk.has(u.post) && (bo.get(u.post) || 0) < bk.get(u.post)) bo.set(u.post, (bo.get(u.post) || 0) + 1); else u.post = -1; }
  const towersFirst = [...bk].sort((a, b) => (G.buildings[b[0]].type === 'guard') - (G.buildings[a[0]].type === 'guard'));
  for (const u of secs) if (u.post < 0) for (const [bid, c] of towersFirst) if ((bo.get(bid) || 0) < c) { u.post = bid; bo.set(bid, (bo.get(bid) || 0) + 1); break; }
  s.bunks = [...bk.values()].reduce((a, b) => a + b, 0);
  const onTower = new Map();
  for (const u of secs) {
    const b = u.post >= 0 ? G.buildings[u.post] : null, n = onTower.get(u.post) || 0, was = u.sniper;
    u.sniper = !!b && b.type === 'guard' && n < b.snipers;
    if (u.sniper) onTower.set(u.post, n + 1);
    if (was && !u.sniper && u.hidden) { unhide(u); u.st = 'patrol'; u.timer = 0; }
  }
  s.civ = civs.length; s.sec = secs.length; s.pop = civs.length + secs.length;
}

function economy(G, s, dt) {
  const built = s.blds.filter((b) => b.built);
  // power first: generators burn fuel
  let sup = 0, dem = 0;
  for (const b of built) {
    const def = B[b.type];
    if (!def.power) continue;
    if (def.power > 0) {
      let f = b.staff;
      if (def.cons) for (const k in def.cons) { const need = (def.cons[k] / DAY) * dt * b.staff; if (need > 0) f = Math.min(f, s.res[k] / need * b.staff); }
      f = Math.max(0, Math.min(f, b.staff));
      if (def.cons) for (const k in def.cons) s.res[k] = Math.max(0, s.res[k] - (def.cons[k] / DAY) * dt * f);
      b.eff = f; sup += def.power * f * (b.road ? 1.1 : 1);
    } else dem += -def.power * b.staff;
  }
  const ratio = dem > 0 ? Math.min(1, sup / dem) : 1;
  s.power = { sup, dem, ratio };
  const rate = Object.fromEntries(RES.map((k) => [k, 0]));
  let appeal = 0, kh = 0;
  for (const b of built) {
    const def = B[b.type];
    if (def.power > 0) continue;
    let f = b.staff * (def.power < 0 ? ratio : 1);
    if (def.cons) {
      for (const k in def.cons) { const need = (def.cons[k] / DAY) * dt * f; if (need > 0 && s.res[k] < need) f *= s.res[k] / need; }
      for (const k in def.cons) { const n = (def.cons[k] / DAY) * dt * f; s.res[k] -= n; rate[k] -= def.cons[k] * f; }
    }
    const m = f * eraMult(b) * (b.road ? 1.15 : 1);
    b.eff = def.jobs || def.power ? f : 1;
    if (def.prod) for (const k in def.prod) { s.res[k] += (def.prod[k] / DAY) * dt * m; rate[k] += def.prod[k] * m; }
    if (def.research) kh += (def.research / DAY) * dt * m;
    if (def.appeal) appeal += def.appeal * (def.jobs ? Math.max(0.5, f) : 1) * eraMult(b);
  }
  for (const b of built) if (b.siding) appeal += 0.5;
  // once the tree is finished, spare know-how goes into civic pride, with diminishing returns
  s.excessAppeal = 0;
  if (Object.keys(TECH).every((id) => G.research.done[id])) { const x = ((kh / dt) * DAY) * 0.1; s.excessAppeal = x / (1 + x / 30); appeal += s.excessAppeal; }
  // EV plants put cars on the roads; that is appeal too, and shown by the renderer
  const eat = (s.pop * 0.7) / DAY * dt;
  s.res.food -= eat; rate.food -= s.pop * 0.7;
  if (s.res.food < 0) s.res.food = 0;
  s.rate = rate; s.appeal = appeal; s.kh = (kh / dt) * DAY;
  G.kh += kh;
  s.popCap = Math.floor(24 + appeal * 3 + eraNow(G) * 8);
  s.siding = sidingNow(G, s);
  // growth: surplus food plus a free bed draws settlers in from the wastes
  if (s.house > s.civ && s.res.food >= 16 + s.pop * 0.2 && rate.food >= 0 && s.pop < s.popCap) {
    s.arrive += dt * (1 + appeal / 8) / 14;
    if (s.arrive >= 1) { s.arrive = 0; s.res.food -= 6; settlerArrives(G, s); }
  } else s.arrive = Math.max(0, s.arrive - dt * 0.01);
  // starvation
  if (s.res.food <= 0.01 && rate.food < 0 && s.pop > 0) {
    s.starve += dt;
    if (s.starve > 15) {
      s.starve = 0;
      const u = G.units.find((o) => o.sid === s.id && o.kind === 'civ' && o.hp > 0);
      if (u) { releaseTask(G, u); G.units.splice(G.units.indexOf(u), 1); logMsg(G, `A hungry settler gave up on ${s.name} and walked into the wastes.`, 'bad', u.x, u.y); }
    }
  } else s.starve = 0;
  // auto-recruit
  if (s.autoRecruit && s.sec < s.bunks && s.civ > 4 && s.res.food > 10) recruit(G, s.id);
}
function settlerArrives(G, s) {
  const op = outpostOf(G, s.id);
  if (!op) return;
  for (let k = 0; k < 20; k++) {
    const a = rand(G) * Math.PI * 2, r = rr(G, 14, 18);
    const x = Math.floor(op.x + 1 + Math.cos(a) * r), y = Math.floor(op.y + 1 + Math.sin(a) * r);
    if (!passable(G, x, y)) continue;
    const u = spawnPerson(G, s.id, 'civ', x + 0.5, y + 0.5);
    u.crew = true; u.st = 'idle';
    G.stats.born++;
    if (G.stats.born % 5 === 1) logMsg(G, `A settler wandered into ${s.name}. Word is getting around.`, 'good', x, y);
    return;
  }
}
export function recruit(G, sid) {
  const s = G.settlements[sid];
  if (s.sec >= s.bunks) return { ok: false, reason: 'No free bunks. Build a Guard Tower.' };
  if (s.civ <= 2) return { ok: false, reason: 'Not enough settlers' };
  const cost = { food: 8 };
  for (const k in cost) if (s.res[k] < cost[k]) return { ok: false, reason: `Not enough ${k}` };
  const op = outpostOf(G, sid);
  const civs = G.units.filter((u) => u.sid === sid && u.kind === 'civ' && u.hp > 0 && u.st !== 'flee' && u.st !== 'shelter');
  if (!civs.length) return { ok: false, reason: 'Nobody available' };
  civs.sort((a, b) => (a.crew === b.crew ? 0 : a.crew ? -1 : 1) || Math.hypot(a.x - op.x, a.y - op.y) - Math.hypot(b.x - op.x, b.y - op.y));
  const u = civs[0];
  for (const k in cost) s.res[k] -= cost[k];
  releaseTask(G, u);
  u.kind = 'sec'; u.hp = u.max = 60; u.crew = false; u.job = -1; u.home = -1; u.st = 'patrol'; u.timer = 0; u.calm = 10;
  s.sec++; s.civ--;
  assign(G, s);
  return { ok: true };
}

function director(G, s, dt) {
  const op = outpostOf(G, s.id);
  if (!op) return;
  const host = G.units.filter((u) => isHostile(u) && u.sid === s.id).length;
  const age = G.t - s.founded;
  s.mutT -= dt; s.raidT -= dt;
  if (s.mutT <= 0) {
    s.mutT = rr(G, 45, 85) * Math.max(0.45, 1 - s.pop / 90);
    if (host < 10) {
      const n = s.pop > 12 && rand(G) < 0.4 ? 2 : 1;
      const at = spawnPoint(G, op);
      if (at) {
        for (let k = 0; k < n; k++) spawnHostile(G, 'mutant', at[0] + k, at[1], s.id);
        logMsg(G, n > 1 ? `Two mutants are shambling toward ${s.name} from the ${dirName(at, op)}.` : `A mutant is shambling toward ${s.name} from the ${dirName(at, op)}.`, 'warn', at[0], at[1]);
      }
    }
  }
  if (s.raidT <= 0 && age > 300 && s.pop >= 10) {
    s.raidT = rr(G, 170, 270) * Math.max(0.5, 1 - s.pop / 140);
    if (host < 10) {
      const n = Math.min(7, 2 + Math.floor(s.pop / 18));
      const at = spawnPoint(G, op);
      if (at) {
        for (let k = 0; k < n; k++) { const h = spawnHostile(G, 'raider', at[0] + (k % 3), at[1] + Math.floor(k / 3), s.id); h.hx = at[0]; h.hy = at[1]; }
        logMsg(G, `RAIDERS! ${n} of them, coming at ${s.name} from the ${dirName(at, op)}.`, 'bad', at[0], at[1]);
        if (n >= 4) G.news.push({ k: 'raid', n, sid: s.id });
      }
    }
  }
}
function spawnPoint(G, op) {
  for (let k = 0; k < 40; k++) {
    const a = rand(G) * Math.PI * 2, r = rr(G, 21, 27);
    const x = Math.floor(op.x + 1 + Math.cos(a) * r), y = Math.floor(op.y + 1 + Math.sin(a) * r);
    if (!passable(G, x, y) || !passable(G, x + 1, y) || G.own[I(x, y)] >= 0) continue;
    return [x, y];
  }
  return null;
}
function dirName(at, op) {
  // screen-space compass: +x goes down-right, +y down-left on screen
  const sx = (at[0] - op.x) - (at[1] - op.y), sy = (at[0] - op.x) + (at[1] - op.y);
  const a = Math.atan2(sy, sx), k = Math.round(a / (Math.PI / 4));
  return ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'][(k + 8) % 8];
}

// ---------- research ----------
export function setResearch(G, id) {
  const t = TECH[id];
  if (!t || G.research.done[id]) return { ok: false, reason: 'Already known' };
  if (!t.req.every((r) => G.research.done[r])) return { ok: false, reason: 'Prerequisites missing' };
  if (G.research.cur !== id) { G.research.cur = id; G.research.prog = G.research.prog0?.[id] || 0; }
  return { ok: true };
}
function researchTick(G) {
  const R = G.research;
  if (!R.cur || G.kh <= 0) return;
  const t = TECH[R.cur];
  const take = Math.min(G.kh, t.cost - R.prog);
  R.prog += take; G.kh -= take;
  if (R.prog >= t.cost - 1e-6) {
    R.done[R.cur] = true;
    const id = R.cur;
    R.cur = null; R.prog = 0;
    G.alerts.push({ k: 'tech', id });
    G.news.push({ k: 'tech', id });
    logMsg(G, `Research complete: ${t.name}.`, 'good');
    if (id === 'carpentry') logMsg(G, 'The Timber era begins. New buildings use wood, and old ones can be renovated.', 'good');
    if (id === 'reconstruction') logMsg(G, 'The Masonry era begins: brick, stone, metal and glass.', 'good');
    for (const b of G.buildings) b.road = !b.dead && roadAdj(G, b);
  }
}

// ---------- MSV ----------
export function startMSV(G, bid) {
  const b = G.buildings[bid];
  if (!b || b.type !== 'vworks' || !b.built) return { ok: false, reason: 'Needs a finished Vehicle Works' };
  if (b.msv) return { ok: false, reason: b.msv.ready ? 'An MSV is already waiting' : 'Already assembling' };
  const s = G.settlements[b.sid];
  for (const k in MSV.cost) if (s.res[k] < MSV.cost[k]) return { ok: false, reason: `Not enough ${k}` };
  for (const k in MSV.cost) s.res[k] -= MSV.cost[k];
  b.msv = { prog: 0, ready: false };
  logMsg(G, `${s.name} Vehicle Works began assembling a Mobile Settlement Vehicle.`, 'info', b.x, b.y);
  return { ok: true };
}
export function msvCrew(G, sid) {
  const s = G.settlements[sid];
  const n = Math.min(MSV.settlers, s.civ - 4);
  return { n, sec: Math.max(1, Math.round(n * 0.1)), ok: n >= MSV.minSettlers };
}
export function canDispatch(G, bid, tx, ty) {
  const b = G.buildings[bid];
  if (!b || !b.msv || !b.msv.ready) return { ok: false, reason: 'No MSV ready' };
  if (!inb(tx, ty) || tx < 4 || ty < 4 || tx > N - 6 || ty > N - 6) return { ok: false, reason: 'Too close to the edge of the map' };
  for (const o of G.buildings) if (!o.dead && Math.hypot(o.x + o.w / 2 - tx, o.y + o.d / 2 - ty) < MSV.minDist) return { ok: false, reason: `Must be ${MSV.minDist}+ tiles from any town` };
  for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) { const t = G.terr[I(x, y)]; if (t === T.WATER || t === T.TOXIC) return { ok: false, reason: 'Needs dry ground' }; }
  const c = msvCrew(G, b.sid);
  if (!c.ok) return { ok: false, reason: `Needs ${MSV.minSettlers + 4}+ settlers in town to spare ${MSV.minSettlers}` };
  return { ok: true, crew: c };
}
export function dispatchMSV(G, bid, tx, ty) {
  const r = canDispatch(G, bid, tx, ty);
  if (!r.ok) return r;
  const b = G.buildings[bid], s = G.settlements[b.sid];
  const pass = (x, y) => inb(x, y) && G.bld[I(x, y)] < 0; // it bulldozes anything and bridges what it cannot
  const routeOpt = { dirs: [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]], cost: (i) => (isWet(G, i) ? 14 : G.road[i] ? 0.4 : G.feat[i] === F.RUIN ? 3 : 1) };
  const op = outpostOf(G, s.id);
  // start beside the works, end beside the new outpost site
  let start = null;
  for (let x = b.x - 1; x <= b.x + b.w && !start; x++) for (let y = b.y - 1; y <= b.y + b.d && !start; y++) if (adjToRect(x, y, b) && pass(x, y)) start = [x, y];
  if (!start) return { ok: false, reason: 'The Vehicle Works is boxed in' };
  const path = astar(G, start[0], start[1], (x, y) => Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && !(x >= tx && x < tx + 2 && y >= ty && y < ty + 2), tx, ty, 120000, pass, routeOpt);
  if (!path) return { ok: false, reason: 'No route there' };
  // passengers
  const civs = G.units.filter((u) => u.sid === s.id && u.kind === 'civ' && u.hp > 0).sort((a, b2) => (b2.crew ? 1 : 0) - (a.crew ? 1 : 0));
  const secs = G.units.filter((u) => u.sid === s.id && u.kind === 'sec' && u.hp > 0);
  const riders = [];
  for (let k = 0; k < r.crew.n; k++) riders.push(civs.shift());
  for (let k = 0; k < r.crew.sec; k++) riders.push(secs.length > 1 ? secs.shift() : Object.assign(civs.shift() || {}, { promote: true }));
  const people = [];
  for (const u of riders) {
    if (!u || !u.id) continue;
    releaseTask(G, u);
    const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1);
    people.push(u.promote ? 'sec' : u.kind);
  }
  b.msv = null;
  G.convoys.push({ id: G.nextId++, from: s.id, path: [I(start[0], start[1]), ...path], pos: 0, people, dest: [tx, ty], era: eraNow(G), t0: G.t });
  G.news.push({ k: 'msv', sid: s.id });
  logMsg(G, `An MSV rolled out of ${s.name} with ${people.length} aboard, cutting a road as it goes.`, 'good', start[0], start[1]);
  assign(G, s);
  return { ok: true };
}
function convoyTick(G, c, dt) {
  const prev = Math.floor(c.pos);
  c.pos = Math.min(c.path.length - 1, c.pos + dt * 2.2);
  for (let k = prev; k <= Math.floor(c.pos); k++) {
    const i = c.path[k], x = i % N, y = (i / N) | 0, j = c.path[k > 0 ? k - 1 : k + 1];
    if (G.bld[i] < 0 && !G.road[i]) setRoad(G, x, y, c.era, c.from, Math.abs(j - i) === 1 ? 1 : 2);
    revealCircle(G, x + 0.5, y + 0.5, 5);
  }
  if (c.pos >= c.path.length - 1) {
    c.done = true;
    const [tx, ty] = c.dest;
    const name = TOWN_NAMES[(G.settlements.length - 1) % TOWN_NAMES.length];
    const s = addSettlement(G, name, tx, ty);
    for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) { G.feat[I(x, y)] = 0; G.road[I(x, y)] = 0; }
    addBuilding(G, 'outpost', tx, ty, s.id, true);
    s.res = Object.assign(Object.fromEntries(RES.map((k) => [k, 0])), MSV.supplies);
    s.mutT = 120; s.raidT = 400; s.founded = G.t;
    for (const kind of c.people) { const u = spawnPerson(G, s.id, kind, tx + 0.5 + rr(G, -1, 3), ty + 2.5 + rr(G, 0, 1)); u.calm = 10; }
    revealCircle(G, tx + 1, ty + 1, 14);
    logMsg(G, `The MSV unfolded into an outpost. Welcome to ${name}. Build farms: they make new settlers.`, 'good', tx, ty);
    G.alerts.push({ k: 'founded', sid: s.id });
    G.news.push({ k: 'founded', sid: s.id });
    assign(G, s);
    for (const b of G.buildings) if (!b.dead) b.road = roadAdj(G, b);
  }
}

// ---------- log ----------
export function logMsg(G, msg, kind = 'info', x = null, y = null) {
  G.log.push({ t: G.t, msg, kind, x, y });
  if (G.log.length > 120) G.log.splice(0, G.log.length - 120);
}

// ---------- tick ----------
export function step(G, dt) {
  G.t += dt;
  for (const u of G.units) {
    if (u.hp <= 0) continue;
    if (u.kind === 'civ') civThink(G, u, dt);
    else if (u.kind === 'sec') secThink(G, u, dt);
    else hostileThink(G, u, dt);
  }
  if (G.units.some((u) => u.hp <= 0 || u.gone)) {
    for (const u of G.units) if (u.hp <= 0 && !isHostile(u)) releaseTask(G, u);
    G.units = G.units.filter((u) => u.hp > 0 && !u.gone);
  }
  for (const c of G.convoys) if (!c.done) convoyTick(G, c, dt);
  if (G.campMoves.length) campTick(G, dt);
  if (G.convoys.some((c) => c.done)) G.convoys = G.convoys.filter((c) => !c.done);
  G.acc += dt;
  if (G.acc >= 1) {
    const tick = G.acc; G.acc = 0;
    if (G.tasks.some((t) => t.dead)) G.tasks = G.tasks.filter((t) => !t.dead);
    for (const s of G.settlements) {
      if (!s.blds) s.blds = G.buildings.filter((b) => !b.dead && b.sid === s.id);
      assign(G, s);
      economy(G, s, tick);
      director(G, s, tick);
      checkExpand(G, s);
      for (const b of s.blds) if (b.msv && !b.msv.ready) {
        b.msv.prog += (tick / DAY) * b.staff * s.power.ratio;
        if (b.msv.prog >= MSV.days) { b.msv.ready = true; logMsg(G, `An MSV is ready at ${s.name}. Choose where to send it.`, 'good', b.x, b.y); G.alerts.push({ k: 'msv', bid: b.id }); }
      }
    }
    researchTick(G);
    if (Math.floor(G.t / DAY) !== Math.floor((G.t - tick) / DAY)) marketTick(G);
    for (const u of G.units) if ((u.kind === 'sec' || (u.kind === 'civ' && u.crew)) && !u.hidden) revealCircle(G, u.x, u.y, u.kind === 'sec' ? 5 : 3);
    if (G.fx.length > 400) G.fx.splice(0, G.fx.length - 400);
    G.fx = G.fx.filter((f) => G.t - f.t < f.d);
  }
}

// ---------- save ----------
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
const unb64 = (s, T) => { const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return T === Int32Array ? new Int32Array(u.buffer) : T === Int8Array ? new Int8Array(u.buffer) : u; };
export function save(G) {
  const o = { ...G };
  for (const k of ['terr', 'feat', 'fv', 'road', 'fog', 'bridge']) o[k] = b64(G[k]);
  o.roadSid = b64(new Uint8Array(G.roadSid.buffer));
  delete o.bld; delete o.own; delete o.dirty; delete o.fx; delete o.alerts;
  o.settlements = G.settlements.map((s) => { const c = { ...s }; delete c.blds; return c; });
  o.units = G.units.map((u) => ({ ...u, path: null }));
  return JSON.stringify(o);
}
export function load(str) {
  const o = JSON.parse(str);
  if (o.v !== 1) return null;
  for (const k of ['terr', 'feat', 'fv', 'road', 'fog']) o[k] = unb64(o[k], Uint8Array);
  o.bridge = o.bridge ? unb64(o.bridge, Uint8Array) : new Uint8Array(N * N);
  o.roadSid = o.roadSid ? unb64(o.roadSid, Int8Array) : new Int8Array(N * N).fill(-1);
  o.drops = o.drops || []; o.campMoves = o.campMoves || []; o.news = o.news || [];
  o.market = o.market || Object.fromEntries(RES.map((k) => [k, 1]));
  for (const s of o.settlements) { s.expand = s.expand || 0; s.rally = s.rally || null; }
  for (const b of o.buildings) { if (b.maxJobs === undefined) { b.maxJobs = null; b.maxCrew = null; b.snipers = b.type === 'guard' ? 1 : 0; b.move = null; } }
  for (let i = 0; i < N * N; i++) if (o.road[i] && o.roadSid[i] < 0) o.roadSid[i] = 0; // older saves did not record whose road it was
  o.bld = new Int32Array(N * N).fill(-1); o.own = new Int8Array(N * N).fill(-1);
  o.dirty = new Set(); o.fx = []; o.alerts = [];
  for (const b of o.buildings) if (!b.dead) for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) o.bld[I(x, y)] = b.id;
  for (const u of o.units) { u.path = null; if (u.st === 'toWork' || u.st === 'toHome' || u.st === 'errand' || u.st === 'toTask') u.st = 'idle'; }
  buildingsChanged(o);
  return o;
}

// ---------- helpers for UI/tests ----------
export function dev(G) {
  return {
    give(sid = 0, n = 500) { for (const k of RES) G.settlements[sid].res[k] += n; },
    research(id) { G.research.done[id] = true; },
    researchAll() { for (const id in TECH) G.research.done[id] = true; },
    spawn(kind, sid = 0) { const op = outpostOf(G, sid); const at = spawnPoint(G, op); if (at) spawnHostile(G, kind, at[0], at[1], sid); return at; },
    settlers(sid = 0, n = 5) { const op = outpostOf(G, sid); for (let k = 0; k < n; k++) spawnPerson(G, sid, 'civ', op.x + 0.5 + k % 3, op.y + 2.5).crew = true; },
    finishAll() { for (const t of G.tasks) if (!t.dead && t.kind !== 'clear') completeTask(G, t); },
    msvReady(bid) { const b = G.buildings[bid]; b.msv = { prog: MSV.days, ready: true }; },
    // drop a finished building anywhere (for art checks): ignores rules and costs
    stamp(type, x, y, era = 0, siding = false, hue = 0, sid = 0) {
      const [w, d] = B[type].size;
      for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) { const i = I(xx, yy); if (G.bld[i] >= 0) return null; G.terr[i] = T.DIRT; G.feat[i] = 0; }
      const b = addBuilding(G, type, x, y, sid, true);
      b.era = era; b.siding = siding; b.hue = hue;
      return b;
    },
    reveal(x, y, r) { revealCircle(G, x, y, r); },
  };
}
export { outpostOf, assign };

// ---------- player settings ----------
export function setStaffCap(G, bid, kind, n) {
  const b = G.buildings[bid], def = B[b.type], max = kind === 'crew' ? def.crew : def.jobs;
  if (!max) return { ok: false };
  n = Math.max(0, Math.min(max, n));
  if (kind === 'crew') b.maxCrew = n; else b.maxJobs = n;
  assign(G, G.settlements[b.sid]);
  return { ok: true, n };
}
export const towerBunks = (b) => Math.round(B.guard.bunks * eraMult(b));
export function setSnipers(G, bid, n) {
  const b = G.buildings[bid];
  if (b.type !== 'guard') return { ok: false };
  b.snipers = Math.max(0, Math.min(towerBunks(b), n));
  assign(G, G.settlements[b.sid]);
  return { ok: true, n: b.snipers };
}
export const RALLY_RANGE = 25;
export function canRally(G, sid, x, y) {
  const op = outpostOf(G, sid);
  if (!inb(x, y) || !op) return { ok: false, reason: 'Off the map' };
  if (Math.hypot(x + 0.5 - (op.x + 1), y + 0.5 - (op.y + 1)) > RALLY_RANGE) return { ok: false, reason: `Must be within ${RALLY_RANGE} squares of the Outpost` };
  if (!passable(G, x, y)) return { ok: false, reason: 'Security cannot stand there' };
  return { ok: true };
}
export function setRally(G, sid, x, y) {
  const r = canRally(G, sid, x, y);
  if (r.ok) G.settlements[sid].rally = { x, y };
  return r;
}
export function clearRally(G, sid) { G.settlements[sid].rally = null; }

// ---------- the market ----------
function marketTick(G) {
  G.marketPrev = { ...G.market };
  for (const k of RES) {
    const m = G.market[k] + rr(G, -0.13, 0.13) + (1 - G.market[k]) * 0.12;
    G.market[k] = Math.max(0.4, Math.min(2.4, m));
  }
}
export const priceOf = (G, k) => MARKET_BASE[k] * G.market[k];
// how much of `to` you get for one `from`, after the trader's cut
export const tradeRate = (G, from, to) => (priceOf(G, from) / priceOf(G, to)) * 0.85;
export function trade(G, sid, from, to, amt) {
  const s = G.settlements[sid];
  if (from === to || amt <= 0) return { ok: false, reason: 'Pick two different materials' };
  if (!s.blds.some((b) => b.type === 'stall' && b.built && b.workers > 0)) return { ok: false, reason: 'Needs a staffed Trading Post' };
  if (s.res[from] < amt) return { ok: false, reason: `Not enough ${from}` };
  const got = Math.floor(amt * tradeRate(G, from, to));
  if (got < 1) return { ok: false, reason: "Not enough to be worth the trader's time" };
  s.res[from] -= amt; s.res[to] += got;
  G.market[from] = Math.max(0.4, G.market[from] * (1 - amt * 0.0012));
  G.market[to] = Math.min(2.4, G.market[to] * (1 + got * 0.0012));
  return { ok: true, got };
}

// ---------- moving a camp ----------
export const FOLD_TIME = 2.6;
export function canMoveCamp(G, bid, x, y) {
  const b = G.buildings[bid];
  if (!b || b.type !== 'camp' || !b.built || b.dead) return { ok: false, reason: 'Not a finished camp' };
  if (b.move) return { ok: false, reason: 'Already on the move' };
  return siteFree(G, bid, x, y, b);
}
function siteFree(G, bid, x, y, b) {
  for (let yy = y; yy < y + b.d; yy++) for (let xx = x; xx < x + b.w; xx++) {
    if (!inb(xx, yy)) return { ok: false, reason: 'Off the map' };
    const i = I(xx, yy);
    if (!G.fog[i]) return { ok: false, reason: 'Unexplored' };
    if (G.terr[i] === T.WATER || G.terr[i] === T.TOXIC) return { ok: false, reason: 'Needs dry ground' };
    if (G.feat[i] === F.RUIN) return { ok: false, reason: 'Ruins in the way' };
    if (G.road[i]) return { ok: false, reason: 'Do not pitch tents on the road' };
    if (G.bld[i] >= 0 && G.bld[i] !== bid) return { ok: false, reason: 'Occupied' };
  }
  return { ok: true };
}
export function moveCamp(G, bid, x, y) {
  const r = canMoveCamp(G, bid, x, y);
  if (!r.ok) return r;
  G.buildings[bid].move = { ph: 'fold', t: 0, tx: x, ty: y };
  G.campMoves.push(bid);
  return { ok: true };
}
function campTick(G, dt) {
  for (const bid of [...G.campMoves]) {
    const b = G.buildings[bid], m = b && b.move;
    if (!m) { G.campMoves.splice(G.campMoves.indexOf(bid), 1); continue; }
    m.t += dt;
    if (m.ph === 'fold' && m.t >= FOLD_TIME) {
      // packed: free the old ground, stake out the new one and set off
      const sx = Math.min(N - 1, b.x + (b.w >> 1)), sy = Math.min(N - 1, b.y + b.d);
      for (let yy = b.y; yy < b.y + b.d; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { G.bld[I(xx, yy)] = -1; markDirty(G, xx, yy); }
      const ok = siteFree(G, bid, m.tx, m.ty, b).ok; // someone may have built there meanwhile: then stay put
      const X = ok ? m.tx : b.x, Y = ok ? m.ty : b.y, dest = { x: X, y: Y, w: b.w, d: b.d };
      const path = astar(G, sx, sy, (px, py) => adjToRect(px, py, dest), X + b.w / 2, Y + b.d / 2, 40000) || [];
      b.x = X; b.y = Y;
      for (let yy = b.y; yy < b.y + b.d; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { const i = I(xx, yy); G.bld[i] = bid; G.feat[i] = 0; markDirty(G, xx, yy); }
      b.move = { ph: 'travel', t: 0, path: [I(sx, sy), ...path], pos: 0, truck: (G.counts.evplant || 0) > 0 };
      buildingsChanged(G);
    } else if (m.ph === 'travel') {
      m.pos = Math.min(m.path.length - 1, m.pos + dt * (m.truck ? 3.6 : 1.5));
      const at = (p) => {
        const k = Math.max(0, Math.min(m.path.length - 1, p)), a = m.path[Math.floor(k)], c = m.path[Math.min(m.path.length - 1, Math.floor(k) + 1)], f = k - Math.floor(k);
        return [(a % N) + 0.5 + ((c % N) - (a % N)) * f, ((a / N) | 0) + 0.5 + (((c / N) | 0) - ((a / N) | 0)) * f];
      };
      let n = 0;
      for (const u of G.units) {
        if (u.post !== bid || u.kind !== 'sec') continue;
        if (m.truck) { hide(u, bid); [u.x, u.y] = at(m.pos); }
        else { u.hidden = false; u.in = -1; u.path = null; [u.x, u.y] = at(m.pos - 1 - n * 0.7); u.walk = (u.walk || 0) + dt * 2; }
        n++;
      }
      const c = at(m.pos);
      revealCircle(G, c[0], c[1], 6);
      if (m.pos >= m.path.length - 1) b.move = { ph: 'unfold', t: 0 };
    } else if (m.ph === 'unfold' && m.t >= FOLD_TIME) {
      b.move = null;
      revealCircle(G, b.x + b.w / 2, b.y + b.d / 2, B.camp.reveal);
      for (const u of G.units) if (u.post === bid && u.kind === 'sec') { u.hidden = false; u.in = -1; u.x = b.x + b.w / 2; u.y = b.y + b.d + 0.5; u.st = 'patrol'; u.timer = 0; u.path = null; }
    }
  }
}

// ---------- RFIS: what the town most needs in order to grow, 0 to 1 ----------
export function rfis(G, s) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const free = s.house - s.civ, r = clamp(1 - free / Math.max(3, s.civ * 0.15));
  const eat = Math.max(0.5, s.pop * 0.7), net = s.rate.food || 0;
  const f = clamp(0.55 * (1 - net / Math.max(4, eat * 0.5)) + 0.45 * (1 - s.res.food / Math.max(20, eat * 10)));
  let mats = 0;
  for (const k of ['scrap', 'wood', 'stone', 'metal', 'glass']) mats += Math.max(0, s.rate[k] || 0);
  const idle = Math.max(0, (s.crewN || 0) - (s.crewSlots || 0));
  const i = clamp(Math.max(idle / Math.max(4, s.civ * 0.3), 0.85 * (1 - mats / Math.max(8, s.pop * 0.5))));
  const host = G.units.filter((u) => (u.kind === 'mutant' || u.kind === 'raider') && u.sid === s.id).length;
  const sec = clamp(1 - s.sec / Math.max(2, s.pop / 7) + host * 0.12);
  return { r, f, i, s: sec };
}
