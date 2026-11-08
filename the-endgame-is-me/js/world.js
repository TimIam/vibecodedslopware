// The Endgame is Me: the whole simulation (the boss, the patrol path, the parties, the director, the store). No DOM, so it runs headless.
// One unit is one pixel: the arena is the 320×180 screen.

import * as P from './props.js';
import { LEVELS, levelFor, lastLevel } from './levels/index.js';

export const W = 320, H = 180;   // the screen; a level's world can be bigger and scrolls (g.map.w, g.map.h)
export const LANE = 11;        // half-width of the patrol path
export const LEASH = 60;       // farther than this from the path and you evade
export const ROCK_R = 4;       // the rocks are solid
export const TOUCH = 17;       // close enough to a rock to count as touching it
export const ARENA = { x0: 5, y0: 16, x1: W - 5, y1: H - 20 };
export const BOSS_HP = 4000, BOSS_SPEED = 23, BOSS_R = 10;
export const MULT_STEP = 0.25, MULT_MAX = 5;
export const RAID_LAPS = 10, FINAL_LAPS = 20;   // a 25-man comes at lap 10, the 40-man at lap 20
export const SLOT_KEYS = ['LMB', 'RMB', 'Q', 'E', 'R'];

// base numbers; g.abil holds this run's copy with upgrades applied
export const ABIL = {
  swipe:  { cd: 0.7,  wind: 0.22, dur: 0.14, move: 0.55, range: 28, arc: 2.0, dmg: 110, kb: 16 },
  stomp:  { cd: 4.5,  wind: 0.85, dur: 0.2,  move: 0,    range: 37, dmg: 190, kb: 30 },
  breath: { cd: 9,    wind: 0.45, dur: 1.7,  move: 0.3,  range: 74, arc: 0.8, dmg: 40, dps: 95 },
  roar:   { cd: 16,   wind: 0.35, dur: 0.45, move: 0,    range: 92, fear: 3.2 },
  shake:  { cd: 0.32, wind: 0,    dur: 0.3,  move: 0,    range: 16, kb: 12 },
  tail:   { cd: 3.2,  wind: 0.3,  dur: 0.16, move: 0.4,  range: 28, arc: 2.3, dmg: 120, kb: 26, back: true },
  summon: { cd: 18,   wind: 0.5,  dur: 0.3,  move: 0 },
  beam:   { cd: 14,   wind: 0.9,  dur: 1.4,  move: 0,    range: 170, width: 5, dps: 260 },
  ice:    { cd: 12,   wind: 0.3,  dur: 0.2,  move: 0.3,  range: 42, life: 7 },
  charge: { cd: 8,    wind: 0.35, dur: 4,    move: 0,    range: 52, width: 11, dmg: 100, kb: 20, speed: 150, stun: 1.6 },
  haste:  { cd: 15,   wind: 0,    dur: 0.1,  move: 1,    time: 4, boost: 0.8 },
};

// the store's catalogue. Four abilities come free; the rest are bought with points between maps.
export const ABILITIES = [
  { id: 'swipe', name: 'Swipe', start: true, desc: 'Claw a wide arc in front of you. Hold the button to keep swiping.', up: '+30% damage, longer reach' },
  { id: 'stomp', name: 'Stomp', start: true, desc: 'Slam the ground and hit everyone around you.', up: '+30% damage, 12% wider' },
  { id: 'breath', name: 'Fire Breath', start: true, desc: 'A cone of fire that leaves the ground burning.', up: '+30% damage, 15% farther' },
  { id: 'roar', name: 'Roar', start: true, desc: 'Everyone nearby runs away screaming.', up: '15% farther, fear lasts longer' },
  { id: 'summon', name: 'Call Adds', cost: 12000, desc: 'Summon two Gnashers: melee adds that run down heroes and bite.',
    ups: ['Casters instead: two Spitters that spit fire from beside the path', 'A Necromancer instead, who raises dead heroes as skeletons'], upCost: [25000, 40000] },
  { id: 'beam', name: 'Lightning Beam', cost: 20000, desc: 'Charge up, then fire a huge beam of lightning across the map. Steer it with the mouse.', up: '+35% damage, 20% longer' },
  { id: 'ice', name: 'Ice Floor', cost: 10000, desc: 'Coat the ground around you in ice. Heroes on it slow to a shuffle.', up: '25% wider, lasts 2 s longer' },
  { id: 'charge', name: 'Stun Charge', cost: 12000, desc: 'Lunge forward, stunning everyone you hit, then back up to where you started.', up: '+30% damage, 20% farther, longer stun' },
  { id: 'haste', name: 'Zoomies', cost: 8000, desc: 'Run 80% faster for a few seconds. More path, more points.', up: 'Lasts 1.5 s longer, 20% faster' },
  { id: 'tail', name: 'Tail Sweep', cost: 9000, desc: 'Sweep your tail through everyone standing behind you.', up: '+30% damage, longer reach' },
  { id: 'fur', name: 'Thicker Fur', passive: true, cost: 6000, desc: 'Not an ability. +25% max health, permanently.', up: '+25% max health' },
];
const UP_COST = [16000, 24000, 38000];

// how the boss looks, part by part, and what marks the rock you are walking to. A new run starts on option 0 of
// everything; look.fur is a '#rrggbb' colour, null for the natural brown.
export const LOOKS = {
  head: ['Snout', 'Cyclops', 'Croc snout', 'Turtle beak', 'Bird beak'],
  horns: ['Bull horns', 'Ram curls', 'Antlers', 'No horns'],
  neck: ['Bare', 'Lion mane', 'Spiked collar', 'Long neck', 'Frill'],
  back: ['Shag', 'Dorsal plates', 'Shell', 'Mushrooms', 'Bat wings'],
  tail: ['Tuft', 'Club', 'Stinger', 'Whip', 'Fox brush'],
  limbs: ['Claws', 'Hooves', 'Talons', 'Tentacles'],
  legs: ['Four legs', 'Six legs', 'Eight legs'],
  marker: ['Sparkles', 'Black hole', 'TomTom arrow', 'Victim on a cross', 'Disco ball'],
};

export const ADDS = {
  gnasher:  { name: 'GNASHER', hp: 160, r: 2.5, spd: 36, dmg: 26, rate: 0.8, reach: 4, sense: 80 },
  spitter:  { name: 'SPITTER', hp: 140, r: 3, spd: 0, dmg: 34, rate: 1.5, reach: 70, sense: 70 },
  necro:    { name: 'NECROMANCER', hp: 220, r: 3, spd: 26, dmg: 22, rate: 2.0, reach: 70, sense: 70 },
  skeleton: { name: 'SKELETON', hp: 80, r: 2, spd: 30, dmg: 14, rate: 0.9, reach: 4, sense: 70 },
};
const MAX_ADDS = 8, MAX_SKELETONS = 10;
// the levels bring their own scenery, animals and adds
for (const L of LEVELS) { P.registerKinds(L.kinds, L.critters); Object.assign(ADDS, L.adds || {}); }

export const CLASS = {
  warrior:   { role: 'tank',   col: 'steel',  hp: 460, spd: 25, dmg: 14, rate: 1.2 },
  priest:    { role: 'healer', col: 'white',  hp: 70,  spd: 26, heal: 34, rate: 1.7 },
  druid:     { role: 'healer', col: 'orange', hp: 80,  spd: 26, heal: 28, rate: 1.5 },
  rogue:     { role: 'melee',  col: 'yellow', hp: 85,  spd: 28, dmg: 7,  rate: 0.9 },
  berserker: { role: 'melee',  col: 'red',    hp: 95,  spd: 27, dmg: 8,  rate: 1.1 },
  paladin:   { role: 'melee',  col: 'pink',   hp: 120, spd: 25, dmg: 7,  rate: 1.1 },
  mage:      { role: 'ranged', col: 'blue',   hp: 70,  spd: 26, dmg: 13, rate: 1.8, bolt: 'frost' },
  warlock:   { role: 'ranged', col: 'purple', hp: 75,  spd: 25, dmg: 12, rate: 1.6, bolt: 'shadow' },
  hunter:    { role: 'ranged', col: 'green',  hp: 80,  spd: 27, dmg: 9,  rate: 1.3, bolt: 'arrow' },
  pet:       { role: 'pet',    col: 'brown',  hp: 40,  spd: 40, dmg: 2,  rate: 0.9 },
  rider:     { role: 'rider',  col: 'tan',    hp: 100, spd: 30, dmg: 100, rate: 1.1 },
  king:      { role: 'king',   col: 'gold',   hp: 30,  spd: 14 },   // castle.js: shiny, slow, crunchy
};

const SKILL = {
  raid:    { react: 0.24, dodge: 0.88, fire: 0.06 },
  dungeon: { react: 0.55, dodge: 0.6,  fire: 0.3 },
  rider:   { react: 0.22, dodge: 0.85, fire: 0 },
};
const PTS = { raid: 30, dungeon: 60, pet: 10, rider: 1500 };
const WIPE = { raid: 3000, dungeon: 400, final: 8000 };
const ENGAGE_R = 80;
const SIGIL = { x: -4, y: 0 };   // the weak spot on the boss's back, in boss-local pixels (x points at the head)
const HORSE_SPD = 64;

export const THEMES = [
  { id: 'clearing', name: 'THE CLEARING' }, { id: 'autumn', name: 'THE AUTUMN WOOD' },
  { id: 'ash', name: 'THE ASHLANDS' }, { id: 'snow', name: 'THE SNOWFIELD' },
];

// New Game+: per round, heroes get this much more health and damage, and turn up this much more often
export const NG_HP = 0.6, NG_HIT = 0.4, NG_PACE = 0.25;

export const BOSS_NAMES = ['GORMUND THE UNBOTHERED', 'OLD BRISTLES', 'GRUBB, WARDEN OF TWO ROCKS', 'HAROLD',
  'MORVAK THE AMBLING', 'THE PACING ONE', 'BIG LOUIS', 'UNGOR, WHO WALKS', 'MIKE'];

// what the heroes say. Bubbles are 3×5 font, so keep each line short.
const BARK = {
  raidIdle: ['HEALERS READY?', 'BUFFS PLS', 'DONT PULL', 'WHO HAS FOOD', 'ONE SEC DOG', 'READY CHECK', 'AFK 1 MIN', 'IS IT TANK SWAP?',
    'INV PLS', 'SUMMON PLS', 'LOOT RULES?', 'DKP OR ROLLS', 'LINK THE GUIDE', 'MOM SAYS DINNER', 'IS THIS TRASH?', 'WHO PULLS', 'DISCORD UP?',
    'PUSH TO TALK PLS', 'WHOS BREATHING', 'MUTE YOUR MIC', 'RES THE HUNTER', 'GEAR CHECK', 'IM ONLY 2K GS', 'FLASKS ON'],
  raidFight: ['DPS!!', 'HEAL TANK', 'PUMP', 'NICE', 'KEEP DPS', 'STAY BEHIND', 'LUST?', 'WE GOT THIS', 'DONT PANIC', 'MELEE BEHIND',
    'POP CDS', 'PARSE CHECK', 'IM OOM', 'HEALZ', 'TANK DIED???', 'WHO IS ON ADDS', 'STOP TAKING AGGRO', 'SEND IT', 'BOP IT',
    'HUNTER WHY', 'TOP METER LOL', 'SOAK IT', 'CLIP THAT', 'FOCUS', 'HOLD THREAT', 'ROTATION', 'GREED ROLL'],
  stomp: ['SPREAD!', 'MOVE OUT', 'OUT OUT OUT', 'STOMP!'],
  frontal: ['FRONTAL!', 'DODGE', 'BREATH!', 'SIDESTEP'],
  beam: ['BEAM!!', 'LOS IT!', 'GET BEHIND', 'WHAT IS THAT', 'GODZILLA??'],
  roar: ['FEAR!', 'AAAA', 'NOT AGAIN', 'TREMOR?'],
  fire: ['ITS WARM', 'LOL', 'IM FINE', 'OOPS', 'THIS IS FINE'],
  ice: ['ICE!', 'CANT MOVE', 'SLIPPY', 'MY KNEES', 'SNARED'],
  adds: ['ADDS!', 'SWITCH TO ADDS', 'KILL THE ADDS', 'ADDS ADDS ADDS', 'WHO IS ON ADDS', 'AOE THEM', 'IGNORE ADDS', 'PET TANK ADDS'],
  execute: ['EXECUTE PHASE', 'ALMOST DEAD', 'DONT DIE NOW', 'BURN IT', 'POP EVERYTHING', 'LAST PHASE?', 'IT HAS 10%'],
  died: ['REZ PLS', 'LAG', 'WTF', 'RIP', 'I WAS MOVING', 'REZ?', 'TANK??', 'MY CAT', 'HEALS??', 'UNLUCKY', 'BUGGED',
    'I WAS AFK', 'NO HEALS', 'GG', 'SPIRIT REZ?', 'CORPSE RUN', 'NERF IT', 'MY PING'],
  pull: ['WHO PULLED', 'WTF', 'GO GO GO', 'PULLED!', 'OK WE GO', 'LEEROY?', 'SOMEONE PULLED', 'BRUH'],
  evade: ['EVADE BUG?', 'IT RESET LOL', 'KITE IT BACK', 'LEASHED', 'REALLY?', 'EXPLOIT??', 'REPORTED'],
  flee: ['WIPE IT!', 'RUN!', 'RUN OUT', 'RELEASE?', 'ABANDON', 'SAVE REPAIRS'],
  dance: ['GG', 'EZ', 'LOOT!', 'NEED', '/DANCE', 'GZ', 'FUR IS MINE', 'ROLL NEED', 'FIRST TRY', 'SCREENSHOT', 'GIT GUD'],
  dungeonIdle: ['GOGO', 'PULL?', 'MANA', 'K', 'WAIT', 'ONE MORE', 'LOL', 'LFG', 'NEED TANK', 'SPEEDRUN?', 'SKIP TRASH?',
    'FIRST TIME BTW', 'SWEATY', 'WHO IS LEADER', 'R U A BOT', 'GG EZ', 'KEYS?', 'NEW HERE'],
  dungeonFight: ['TANK??', 'HEAL PLS', 'LOL', 'OMG', 'SRY', 'AGGRO', 'OOM', 'NICE', 'HEALER WHY', 'KICK HUNTER', 'GIT GUD',
    'RIP BOZO', 'NERF THIS', 'PATCH WHEN', 'ITS BUGGED', 'L', 'RATIO', 'SKILL ISSUE', 'TOUCH GRASS', 'COPE', 'MAIN CHARACTER'],
  pet: ['PET!!!', 'HUNTER WTF', 'PET PULLED', 'SORRY PET', 'TURN PET OFF', 'GROWL OFF PLS'],
  logoff: ['BRB', 'GTG', 'LOGGING', 'NOPE', 'CYA', 'BEDTIME', 'WORK TMRW', 'DC'],
  reset: ['BACK TO POSTS', 'LEASH IT', 'RESET', 'HOLD THE TOWER', 'NOT OUR JOB', 'GUARD DUTY'],
  king: ['GUARDS!', 'NOT THE FACE', 'I AM THE KING', 'SOMEONE DO SOMETHING', 'MY ARMOUR!', 'I PAY YOU PEOPLE', 'PROTECT ME'],
  wreckThoughts: ['SMASH.', 'VENGEANCE...', 'MINE NOW', 'NO MORE ROCKS', '*SNIFF* SMOKE', 'WHO BUILT THIS', 'TOO MANY HOUSES', 'HM. FLAMMABLE', 'THEY STARTED IT'],
  thoughts: ['HM.', '*SNIFF*', 'NICE ROCK', 'OTHER ROCK', 'PATROL...', 'WHERE WAS I', '*YAWN*', 'THIS WAY', 'NO, THIS WAY', 'GOOD PATH', '...'],
};

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnToward = (a, target, max) => a + clamp(angDiff(target, a), -max, max);
function mulberry32(a) {
  const next = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  next.rngState = () => a;   // so a save can carry the dice
  return next;
}
export const makeRng = mulberry32;
const pick = (g, arr) => arr[Math.floor(g.rng() * arr.length)];

let AR = ARENA;              // this level's walkable bounds, in world pixels
const V = { x: 0, y: 0 };    // the camera: the screen's top-left corner, in world pixels
function syncView(g) { AR = g.map.arena; V.x = g.cam.x; V.y = g.cam.y; }

// ---------------------------------------------------------------------------------------------- maps

// Map 1 is the short straight path. Every map after it puts the rocks somewhere new and joins them with a longer,
// wigglier path. The path is a polyline sampled every ~2 px, plus a distance field so anything can ask "how far
// am I from the path" in one lookup.
export function makeMap(n, rng) {
  let A, B, ctrl;
  if (n === 1) {
    A = { x: 92, y: 98 }; B = { x: 228, y: 98 };
    ctrl = [A, B];
  } else {
    A = { x: 38 + rng() * 22, y: 48 + rng() * 90 };
    B = { x: W - 38 - rng() * 22, y: 48 + rng() * 90 };
    if (rng() < 0.5) [A, B] = [B, A];
    const k = Math.min(7, n + 1), amp = Math.min(54, 18 + n * 9);
    ctrl = [A];
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1);
      const x = A.x + (B.x - A.x) * t + (rng() - 0.5) * 16;
      const y = 98 + (i % 2 ? -1 : 1) * (amp * (0.6 + rng() * 0.4)) + (rng() - 0.5) * 12;
      ctrl.push({ x, y: clamp(y, x < 110 ? 44 : 36, 144) });
    }
    ctrl.push(B);
  }
  // Catmull-Rom through the control points
  const pts = [];
  const P = i => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  pts.push({ x: B.x, y: B.y });
  let len = 0;
  pts.forEach((p, i) => { if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = len; });
  const df = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = Infinity;
    for (let i = 0; i < pts.length; i += 2) { const dx = x + 0.5 - pts[i].x, dy = y + 0.5 - pts[i].y, d = dx * dx + dy * dy; if (d < m) m = d; }
    df[y * W + x] = Math.sqrt(m);
  }
  return { n, theme: THEMES[(n - 1) % THEMES.length], A, B, pts, len, df, seed: Math.floor(rng() * 1e9) };
}

export function pathDist(m, x, y) { return m.df[clamp(Math.round(y - 0.5), 0, H - 1) * W + clamp(Math.round(x - 0.5), 0, W - 1)]; }
export function pathNearest(m, x, y) {
  let best = m.pts[0], bd = Infinity;
  for (const p of m.pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
function pathAt(m, s) {
  const p = m.pts.find(q => q.s >= s) || m.pts[m.pts.length - 1];
  const i = m.pts.indexOf(p), q = m.pts[Math.min(m.pts.length - 1, i + 1)];
  return { x: p.x, y: p.y, face: Math.atan2(q.y - p.y, q.x - p.x) };
}
export const destRock = g => g.lastMark === 'A' ? g.map.B : g.map.A;

// ---------------------------------------------------------------------------------------------- a new run

export function createGame(seed = (Math.random() * 2 ** 32) >>> 0, look) {
  const rng = mulberry32(seed);
  const g = {
    seed, rng, t: 0, map: null, cam: { x: 0, y: 0 },
    boss: {
      x: 0, y: 0, face: 0, r: BOSS_R, hp: BOSS_HP, maxhp: BOSS_HP, act: null, queue: null,
      cd: Object.fromEntries(Object.keys(ABIL).map(k => [k, 0])), walk: 0, moving: false, evade: null, taunt: null,
      flash: 0, dead: false, deadT: 0, calmT: 99, haste: 0, name: BOSS_NAMES[Math.floor(rng() * BOSS_NAMES.length)],
    },
    units: [], parties: [], corpses: [], ghosts: [], fires: [], ice: [], bolts: [], parts: [], texts: [], barks: [], rings: [], adds: [],
    steps: [],                // footprints the renderer stamps into the worn path
    props: [], critters: [], ashes: [], water: null, chaos: 0, vengeT: 0, won: false, winT: 0,
    abil: null, owned: new Set(ABILITIES.filter(a => a.start).map(a => a.id)), lvl: {},
    slots: ['swipe', 'stomp', 'breath', 'roar', null],
    look: { head: 0, horns: 0, neck: 0, back: 0, tail: 0, limbs: 0, legs: 0, marker: 0, fur: null, ...look },
    ng: 0,                    // New Game+ round: 0 the first time through
    score: 0, points: 0, spent: 0, mult: 1, laps: 0, lapsMap: 0, legDist: 0, kills: 0, summoned: 0, maps: 0,
    wipes: { raid: 0, dungeon: 0, rider: 0, final: 0 }, escaped: 0, patrolDist: 0,
    lastMark: 'A', onPatrol: false, offLane: 0, shortcutT: 0,
    banner: null, thought: null, thoughtT: 4, clear: null, store: false,
    dir: { next: 8, n: 0, lastRaid: -999, raids: 0, final: false },
    blame: { raid: 0, dungeon: 0, rider: 0 }, // recent damage by party type, for the game over line
    events: [], shake: 0, over: false, nextId: 1,
  };
  applyLevels(g);
  loadLevel(g, 1);
  return g;
}

function placeBoss(g) {
  const m = g.map;
  const p = m.mode === 'patrol' ? pathAt(m, Math.min(26, m.len * 0.15)) : m.start;
  Object.assign(g.boss, { x: p.x, y: p.y, face: p.face || 0 });
}

const ARRAYS = ['units', 'parties', 'corpses', 'ghosts', 'fires', 'ice', 'bolts', 'parts', 'texts', 'barks', 'rings', 'adds', 'steps', 'props', 'critters', 'ashes'];

// builds level n: its map, its scenery and animals, and an empty field
function loadLevel(g, n) {
  const L = levelFor(n);
  for (const k of ARRAYS) g[k] = [];
  g.water = null; g.pgrid = null; g.chaos = 0; g.vengeT = 0;
  const m = L.mode === 'patrol' ? makeMap(n, g.rng) : { w: W, h: H, scroll: 'none', ...L.build(g, g.rng, P) };
  Object.assign(m, { n, level: L, mode: L.mode, name: L.name, theme: { id: L.id, name: L.name } });
  m.w ||= W; m.h ||= H; m.scroll ||= 'none';
  m.arena = { x0: 5, y0: 16, x1: m.w - 5, y1: m.h - 20 };
  // Chaos 100% means wrecking a bit over half of what there is to wreck
  let total = 0;
  for (const p of g.props) total += P.KINDS[p.kind].value.chaos;
  for (const c of g.critters) total += P.CRITTERS[c.kind].value.chaos;
  m.chaosNeed = Math.max(1, total * 0.55);
  g.map = m;
  g.levelT0 = g.t;
  placeBoss(g);
  updateCam(g, 0, true);
  syncView(g);
}

// the camera follows the boss along whichever axis the level scrolls
function updateCam(g, dt, snap) {
  if (g.walkoff && !snap) return;   // the camera stays put and watches you go
  const m = g.map, b = g.boss;
  const tx = m.scroll === 'x' || m.scroll === 'xy' ? clamp(b.x - W / 2, 0, m.w - W) : 0;
  const ty = m.scroll === 'y' || m.scroll === 'xy' ? clamp(b.y - H / 2 - 8, 0, m.h - H) : 0;
  const k = snap ? 1 : 1 - Math.exp(-6 * dt);
  g.cam.x += (tx - g.cam.x) * k; g.cam.y += (ty - g.cam.y) * k;
}

// called when the store closes: the next level, a fresh boss (same upgrades)
export function nextMap(g) {
  const n = g.map.n + 1;
  const b = g.boss;
  Object.assign(b, { act: null, queue: null, evade: null, taunt: null, haste: 0, flash: 0, hp: b.maxhp, calmT: 99 });
  for (const k in b.cd) b.cd[k] = 0;
  Object.assign(g, { lastMark: 'A', legDist: 0, lapsMap: 0, clear: null, store: false, offLane: 0, mult: 1, walkoff: null });
  loadLevel(g, n);
  g.dir = { next: g.t + 8, n: 0, lastRaid: g.t, raids: 0, final: false };
  banner(g, `LEVEL ${n}: ${g.map.level.name}`, g.map.level.sub || '', 4);
  g.events.push('newmap');
}
export const isLastLevel = g => g.map.n >= lastLevel();
// tests only: drop straight into level n
export function jumpToLevel(g, n) { g.map.n = n - 1; g.store = true; nextMap(g); }

// ---------------------------------------------------------------------------------------------- the step

// input: { mx, my (aim, arena px), ax, ay (move, -1..1), press: {slot0..slot4, shake} (edges), hold: {slot0} }
export function step(g, inp, dt) {
  if (g.store) return;
  syncView(g);
  g.t += dt;
  g.shake = Math.max(0, g.shake - dt);
  updateBoss(g, inp, dt);
  updateCam(g, dt);
  syncView(g);
  director(g, dt);
  P.updateProps(g, dt);
  g.map.level.update?.(g, dt, LAPI);
  for (const p of g.parties) updateParty(g, p, dt);
  for (const u of g.units) if (!u.dead) updateUnit(g, u, dt);
  for (const a of g.adds) if (!a.dead) updateAdd(g, a, dt);
  separate(g);
  updateBolts(g, dt);
  updateFx(g, dt);
  g.units = g.units.filter(u => !u.dead && !u.gone);
  g.adds = g.adds.filter(a => !a.dead);
  g.parties = g.parties.filter(p => !p.done);
  for (const k in g.blame) g.blame[k] *= Math.exp(-dt / 8);
  if (g.boss.dead) { g.boss.deadT += dt; if (g.boss.deadT > 4 && !g.over) { g.over = true; g.events.push('over'); } }
  if (g.won && !g.boss.dead) { g.winT += dt; if (g.winT > 6 && !g.wonSent) { g.wonSent = true; g.events.push('won'); } }
  if (g.clear && !g.boss.dead) {
    g.clear.t += dt;
    // after a walk-off the store opens a moment after you leave the top of the screen; heroes still running don't matter
    if (g.walkoff) { if (g.walkoff.off && (g.walkoff.offT = (g.walkoff.offT || 0) + dt) > 1) { g.store = true; g.maps++; g.events.push('store'); } }
    else if (g.clear.t > 4.5 && !g.units.some(u => !u.gone && u.x > V.x - 8 && u.x < V.x + W + 8 && u.y > V.y - 8 && u.y < V.y + H + 8) || g.clear.t > 9) {
      g.store = true; g.maps++;
      g.events.push('store');
    }
  }
}

export function addScore(g, n) { g.score += n; g.points += n; }

// from level 2 on, wrecking things feeds Vengeance (the multiplier) and Chaos (the progress meter)
function vengeance(g, v) {
  if (g.map.mode === 'patrol') return;
  g.mult = Math.min(MULT_MAX, g.mult + v);
  g.vengeT = 0;
}
function addChaos(g, c) {
  if (g.map.mode !== 'chaos') return;
  const before = g.chaos;
  g.chaos = Math.min(1.25, g.chaos + c / g.map.chaosNeed);
  if (before < 0.5 && g.chaos >= 0.5) text(g, g.boss.x, g.boss.y - 26, 'CHAOS 50%', 'gold', 1.6);
  if (before < 1 && g.chaos >= 1) text(g, g.boss.x, g.boss.y - 26, 'CHAOS 100%', 'gold', 1.6);
}
function sound(g, e) {
  const last = (g.sndT ||= {})[e];
  if (last != null && g.t - last < 0.06) return;
  g.sndT[e] = g.t;
  g.events.push(e);
}
P.setWorldApi({ addScore, text, part, hurt: (g, u, a) => hurt(g, u, a), sound, vengeance, chaos: addChaos });

// what a level's own update() can do
const LAPI = {
  endLevel: (g, title, sub) => levelCleared(g, title, sub),
  win: g => winGame(g),
  banner: (g, s, sub, d) => banner(g, s, sub, d),
  text, part, addScore, vengeance, sound,
  spawnRaid: (g, size) => spawnRaid(g, size), spawnDungeon: g => spawnDungeon(g),
  addAdd: (g, kind, x, y) => spawnAdd(g, kind, x, y),
  hurtUnit: (g, u, a) => hurt(g, u, a), flee: g => sendHome(g),
  // the end of the City Wall and the city: control goes, the boss walks north through the hole (towards x) and off
  // the top of the screen taking no damage, the heroes run, and the store opens once it is gone. { x, title, sub }
  walkOff: (g, o) => walkOff(g, o),
  // heroes stationed somewhere (castle.js): { x, y, size: 5 | 25 | 40, power, guard, leash, spread }. They stand at
  // their posts until the boss comes within guard px of one of them (or they get hit), fight, and go back to their
  // posts if the boss leads them more than leash px from where they were stationed. Returns the party.
  garrison: (g, o) => garrison(g, o),
  // a king: one unit in gold armour who never fights and keeps away from the boss near his post. Returns the unit.
  king: (g, o) => spawnKing(g, o),
  scatter: (g, p) => scatter(g, p),   // a party drops everything and runs for the edge
  bark: (g, u, s) => bark(g, u, s),
  alive: p => alive(p),
};

// ---------------------------------------------------------------------------------------------- boss

function updateBoss(g, inp, dt) {
  const b = g.boss, m = g.map;
  if (b.dead) return;
  if (g.walkoff) { walkOffStep(g, dt); return; }
  for (const k in b.cd) b.cd[k] = Math.max(0, b.cd[k] - dt);
  b.flash = Math.max(0, b.flash - dt);
  b.haste = Math.max(0, b.haste - dt);
  b.calmT += dt;

  if (b.evade) {
    const dx = b.evade.x - b.x, dy = b.evade.y - b.y, d = Math.hypot(dx, dy);
    const s = Math.min(d, 62 * dt);
    if (d > 0.01) { b.x += dx / d * s; b.y += dy / d * s; b.face = turnToward(b.face, Math.atan2(dy, dx), 8 * dt); b.walk += s * 0.3; }
    b.hp = Math.min(b.maxhp, b.hp + (b.maxhp - b.hp) * 0.5 * dt);
    b.moving = true;
    if (d < 1) b.evade = null;
    return;
  }

  // facing: toward the mouse, unless a tank has taunted you
  let tx = inp.mx, ty = inp.my;
  if (b.taunt) {
    const u = b.taunt.u;
    b.taunt.t -= dt;
    if (u.dead || b.taunt.t <= 0) b.taunt = null; else { tx = u.x; ty = u.y; }
  }
  const channel = b.act?.fired && (b.act.kind === 'breath' || b.act.kind === 'beam');
  const locked = b.act?.kind === 'charge' && b.act.fired;
  const turn = channel ? (b.act.kind === 'beam' ? 1.2 : 1.5) : b.taunt ? 7 : 5.5;
  if (!locked && Math.hypot(tx - b.x, ty - b.y) > 2) b.face = turnToward(b.face, Math.atan2(ty - b.y, tx - b.x), turn * dt);

  // abilities: the five slots, plus shake on its own key. A press during another action is queued briefly.
  for (let i = 0; i < 5; i++) {
    const k = g.slots[i];
    if (k && inp.press?.['slot' + i] && !tryCast(g, k)) b.queue = { k, t: 0.5 };
  }
  if (inp.press?.shake && !tryCast(g, 'shake')) b.queue = { k: 'shake', t: 0.5 };
  // a queued press goes before a held swipe, or holding the button would starve it
  if (b.queue) { b.queue.t -= dt; if (b.queue.t <= 0 || tryCast(g, b.queue.k)) b.queue = null; }
  if (inp.hold?.slot0 && g.slots[0] && !b.act && !b.queue) tryCast(g, g.slots[0]);

  // movement
  let mx = inp.ax || 0, my = inp.ay || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const sp = BOSS_SPEED * (b.haste > 0 ? 1 + g.abil.haste.boost : 1) * (b.act ? g.abil[b.act.kind].move : 1);
  const ox = b.x, oy = b.y;
  moveBoss(g, b.x + mx * sp * dt, b.y + my * sp * dt);
  if (g.props.length || g.critters.length) P.bossTouch(g, ox, oy, dt);
  if (b.haste > 0 && (mx || my) && g.rng() < 0.5) part(g, b.x - mx * 10, b.y - my * 10 + 3, -mx * 20, -my * 20, 0.3, 'dust');
  if (b.act) advanceAct(g, dt);
  const moved = Math.hypot(b.x - ox, b.y - oy);
  b.moving = moved > 0.01;
  if (b.moving) {
    const before = Math.floor(b.walk / 4);
    b.walk += moved * 0.3;
    if (Math.floor(b.walk / 4) !== before) g.steps.push({ x: b.x, y: b.y, face: b.face, side: Math.floor(b.walk / 4) & 1 });
  }

  // patrol scoring (level 1); after that, Vengeance drains away if you stop wrecking things
  if (m.mode !== 'patrol') {
    g.onPatrol = false;
    g.vengeT += dt;
    if (g.vengeT > 4) g.mult = Math.max(1, g.mult - 0.1 * dt);
  } else {
  const sd = pathDist(m, b.x, b.y);
  g.onPatrol = sd < LANE;
  if (g.onPatrol) {
    addScore(g, moved * g.mult);
    g.patrolDist += moved;
    g.legDist += moved;
    g.offLane = 0;
  } else {
    g.offLane += dt;
    if (g.offLane > 3) g.mult = Math.max(1, g.mult - 0.12 * dt);
  }
  g.shortcutT = Math.max(0, g.shortcutT - dt);
  const R = destRock(g);
  if (Math.hypot(b.x - R.x, b.y - R.y) < TOUCH) {
    // a lap only counts if you actually walked most of the path to get here
    if (g.legDist >= m.len * 0.6) {
      g.laps++; g.lapsMap++;
      const pts = Math.round(100 * g.mult);
      addScore(g, pts);
      g.mult = Math.min(MULT_MAX, g.mult + MULT_STEP);
      text(g, R.x, R.y - 14, `+${pts}`, 'gold');
      text(g, R.x, R.y - 20, `AIMLESS X${g.mult.toFixed(2)}`, 'cream', 1.6);
      g.events.push('lap');
      g.lastMark = R === m.A ? 'A' : 'B';
      g.legDist = 0;
    } else if (g.shortcutT <= 0) {
      text(g, R.x, R.y - 14, 'SHORTCUT. DOES NOT COUNT', 'pink', 1.6);
      g.shortcutT = 3;
    }
  }
  if (sd > LEASH && !locked) startEvade(g);
  }

  // out of combat you lick your wounds
  const fighting = g.parties.some(p => p.engaged);
  if (!fighting && b.calmT > 4) b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.035 * dt);

  // idle thoughts
  g.thoughtT -= dt;
  if (g.thought) { g.thought.t += dt; if (g.thought.t > 2.4) g.thought = null; }
  if (g.thoughtT <= 0) {
    g.thoughtT = 7 + g.rng() * 7;
    if (!fighting) g.thought = { s: pick(g, m.mode === 'patrol' ? BARK.thoughts : BARK.wreckThoughts), t: 0 };
  }
}

// moves the boss to (x, y), kept inside the arena and out of the rocks
function moveBoss(g, x, y) {
  const b = g.boss, m = g.map;
  x = clamp(x, AR.x0 + b.r, AR.x1 - b.r);
  y = clamp(y, AR.y0 + b.r, AR.y1 - b.r);
  if (g.water && P.hitsWater(g, x, y, b.r)) {
    // the moat and the canals are too deep to wade: slide along them instead
    if (!P.hitsWater(g, x, b.y, b.r)) y = b.y;
    else if (!P.hitsWater(g, b.x, y, b.r)) x = b.x;
    else { x = b.x; y = b.y; }
  }
  b.x = x; b.y = y;
  if (m.A) for (const R of [m.A, m.B]) {
    const dx = b.x - R.x, dy = b.y - R.y, d = Math.hypot(dx, dy), min = b.r + ROCK_R;
    if (d < min && d > 0.001) { b.x = R.x + dx / d * min; b.y = R.y + dy / d * min; }
  }
}

function startEvade(g) {
  const b = g.boss;
  const p = pathNearest(g.map, b.x, b.y);
  b.evade = { x: p.x, y: p.y };
  b.act = null; b.taunt = null; b.queue = null;
  const lost = g.mult > 1;
  g.mult = 1;
  text(g, b.x, b.y - 18, 'EVADE', 'white', 1.6);
  if (lost) text(g, b.x, b.y - 24, 'AIMLESSNESS RESET', 'pink', 1.8);
  g.events.push('evade');
  for (const p of g.parties) if (p.engaged && p.type !== 'rider') { const u = alive(p)[0]; if (u) bark(g, u, pick(g, BARK.evade)); }
}

// The walk-off: the input is ignored, and the boss heads north through the breach and off the top of the screen. It
// steers onto the breach's centre line as it goes so the stubs either side don't catch it, and nothing solid, no
// water and no arena edge stops it on the way.
function walkOff(g, o = {}) {
  const b = g.boss;
  if (g.walkoff || g.clear || g.won || b.dead) return;
  g.walkoff = { x: o.x ?? b.x, t: 0, off: false };
  Object.assign(b, { act: null, queue: null, evade: null, taunt: null, haste: 0 });
  levelCleared(g, o.title, o.sub);
}
function walkOffStep(g, dt) {
  const b = g.boss, w = g.walkoff;
  w.t += dt;
  b.flash = 0;
  const sp = BOSS_SPEED * 1.1;
  const vx = clamp((w.x - b.x) * 3, -sp * 0.8, sp * 0.8), vy = -Math.sqrt(sp * sp - vx * vx);
  const ox = b.x, oy = b.y;
  b.x += vx * dt; b.y += vy * dt;
  b.face = turnToward(b.face, Math.atan2(vy, vx), 6 * dt);
  const moved = Math.hypot(b.x - ox, b.y - oy);
  b.moving = moved > 0.01;
  const before = Math.floor(b.walk / 4);
  b.walk += moved * 0.3;
  if (Math.floor(b.walk / 4) !== before && b.y > 0) g.steps.push({ x: b.x, y: b.y, face: b.face, side: Math.floor(b.walk / 4) & 1 });
  if (!w.off && b.y < V.y - 26) { w.off = true; g.events.push('walkoff'); }
}

function tryCast(g, k) {
  const b = g.boss;
  if (b.act || b.evade || b.dead || b.cd[k] > 0 || g.clear) return false;
  if (k !== 'shake' && !g.owned.has(k)) return false;
  const d = g.abil[k];
  b.act = { kind: k, t: 0, fired: false, tick: 0, fireT: 0 };
  b.cd[k] = d.cd;
  g.events.push('wind_' + k);
  // everybody sees the telegraph and decides whether they will move
  for (const u of g.units) {
    const sk = u.party.skill;
    u.willDodge = g.rng() < sk.dodge;
    u.react = g.t + sk.react * (0.7 + g.rng() * 0.7);
  }
  for (const p of g.parties) {
    if (p.type !== 'raid' || !p.engaged || g.rng() > 0.7) continue;
    const u = alive(p)[Math.floor(g.rng() * 3)];
    if (!u) continue;
    if (k === 'stomp') bark(g, u, pick(g, BARK.stomp));
    if (k === 'breath') bark(g, u, pick(g, BARK.frontal));
    if (k === 'beam') bark(g, u, pick(g, BARK.beam));
    if (k === 'tail') bark(g, u, 'TAIL!');
    if (k === 'charge') bark(g, u, 'CHARGE! MOVE!');
    if (k === 'summon') bark(g, u, pick(g, BARK.adds));
  }
  if (d.wind === 0) advanceAct(g, 0);
  return true;
}

function advanceAct(g, dt) {
  const b = g.boss, a = b.act, d = g.abil[a.kind];
  a.t += dt;
  if (!a.fired && a.t >= d.wind) { a.fired = true; fire(g, a.kind); }
  if (!b.act) return;
  if (a.kind === 'charge' && a.fired) { chargeStep(g, a, d, dt); return; }
  if ((a.kind === 'breath' || a.kind === 'beam') && a.fired) {
    a.tick -= dt;
    if (a.tick <= 0) {
      a.tick += 0.1;
      for (const u of g.units) if (hittable(u) && inZone(g, a.kind, u.x, u.y, 1)) hurt(g, u, d.dps * 0.1);
      if (g.props.length || g.critters.length) {
        const test = (x, y) => inZone(g, a.kind, x, y, 2), reach = a.kind === 'beam' ? beamEnd(g).len + 8 : d.range + 6;
        P.igniteZone(g, test, b.x, b.y, reach, a.kind === 'beam' ? 0.7 : 0.35);
        for (const c of g.critters) if (!c.dead && test(c.x, c.y)) P.hurtCritter(g, c, d.dps * 0.1);
        if (a.kind === 'beam') P.damageZone(g, test, d.dps * 0.1, b.x, b.y, reach);
      }
    }
  }
  if (a.kind === 'breath' && a.fired) {
    a.fireT -= dt;
    if (a.fireT <= 0 && g.fires.length < 40) {
      a.fireT += 0.11;
      const ang = b.face + (g.rng() - 0.5) * d.arc, dist = 16 + g.rng() * (d.range - 18);
      const x = b.x + Math.cos(ang) * dist, y = b.y + Math.sin(ang) * dist;
      if (x > AR.x0 && x < AR.x1 && y > AR.y0 - 6 && y < AR.y1 + 6 && !P.isWater(g, x, y)) {
        const f = { x, y, r: 3.5 + g.rng() * 2.5, t: 0, life: 7 + g.rng() * 2 };
        g.fires.push(f);
        if (g.props.length) P.igniteZone(g, (px, py) => Math.hypot(px - x, py - y) < f.r + 3, x, y, f.r + 6);
      }
    }
    for (let i = 0; i < 3; i++) {
      const ang = b.face + (g.rng() - 0.5) * d.arc, sp = 60 + g.rng() * 60;
      part(g, b.x + Math.cos(b.face) * 14, b.y + Math.sin(b.face) * 14, Math.cos(ang) * sp, Math.sin(ang) * sp,
        0.25 + g.rng() * 0.45, g.rng() < 0.5 ? 'flame' : 'ember');
    }
  }
  if (a.kind === 'beam') {
    g.shake = Math.max(g.shake, a.fired ? 0.12 : 0.03);
    if (!a.fired && g.rng() < 0.6) { const k = g.rng() * TAU; part(g, b.x + Math.cos(k) * 11, b.y + Math.sin(k) * 11, -Math.cos(k) * 15, -Math.sin(k) * 15, 0.3, 'spark'); }
    if (a.fired) { const e = beamEnd(g); for (let i = 0; i < 2; i++) part(g, e.x, e.y, (g.rng() - 0.5) * 80, (g.rng() - 0.5) * 80, 0.3, 'spark'); }
  }
  if (a.t >= d.wind + d.dur) b.act = null;
}

// where the beam stops: its full length, or the edge of the world
export function beamEnd(g) {
  const b = g.boss, d = g.abil.beam, c = Math.cos(b.face), s = Math.sin(b.face);
  let len = d.range;
  if (c > 0.001) len = Math.min(len, (V.x + W + 4 - b.x) / c); else if (c < -0.001) len = Math.min(len, (V.x - 4 - b.x) / c);
  if (s > 0.001) len = Math.min(len, (V.y + H + 4 - b.y) / s); else if (s < -0.001) len = Math.min(len, (V.y - 4 - b.y) / s);
  return { x: b.x + c * len, y: b.y + s * len, len };
}

function fire(g, k) {
  const b = g.boss, d = g.abil[k];
  g.events.push(k);
  if (k === 'swipe' || k === 'stomp' || k === 'tail') {
    for (const u of g.units) {
      if (!hittable(u) || !inZone(g, k, u.x, u.y, 1)) continue;
      hurt(g, u, d.dmg);
      knock(u, b, d.kb);
    }
    if (g.props.length || g.critters.length) P.damageZone(g, (x, y) => inZone(g, k, x, y, 2), d.dmg, b.x, b.y, d.range + 8);
    if (k === 'stomp') {
      g.shake = 0.35;
      g.rings.push({ x: b.x, y: b.y, r: 4, max: d.range, t: 0, col: 'dust' });
      for (let i = 0; i < 28; i++) { const a = g.rng() * TAU, s = 30 + g.rng() * 50; part(g, b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10, Math.cos(a) * s, Math.sin(a) * s, 0.5, 'dust'); }
    } else {
      g.shake = Math.max(g.shake, 0.08);
      g.rings.push({ x: b.x, y: b.y, face: zoneFace(g, k), t: 0, col: 'slash', big: k === 'tail' });
    }
  } else if (k === 'breath') {
    for (const u of g.units) if (hittable(u) && inZone(g, 'breath', u.x, u.y, 1)) hurt(g, u, d.dmg);
  } else if (k === 'roar') {
    g.shake = 0.25;
    g.rings.push({ x: b.x, y: b.y, r: 6, max: d.range, t: 0, col: 'roar' });
    for (const u of g.units) {
      if (u.role === 'rider' && u.state === 'climb') continue;
      if (Math.hypot(u.x - b.x, u.y - b.y) > d.range) continue;
      u.fear = d.fear * (0.8 + g.rng() * 0.4);
      u.cast = 0;
      if (u.role === 'rider' && u.mounted) { u.state = 'orbit'; u.orbitT = 1 + d.fear; u.orbitA = Math.atan2(u.y - b.y, u.x - b.x); u.orbitDir ||= 1; }
    }
    for (const p of g.parties) if (p.type === 'raid' && p.engaged) { const u = alive(p)[1]; if (u) bark(g, u, pick(g, BARK.roar)); }
    for (const c of g.critters) if (Math.hypot(c.x - b.x, c.y - b.y) < d.range) c.scared = 5;
  } else if (k === 'shake') {
    for (let i = 0; i < 14; i++) { const a = g.rng() * TAU, s = 25 + g.rng() * 30; part(g, b.x + Math.cos(a) * 9, b.y + Math.sin(a) * 9, Math.cos(a) * s, Math.sin(a) * s, 0.4, 'fur'); }
    for (const u of g.units) {
      if (u.role === 'rider' && u.state === 'climb') { shakeRider(g, u); continue; }
      if (hittable(u) && Math.hypot(u.x - b.x, u.y - b.y) < b.r + d.range - 8) knock(u, b, d.kb);
    }
  } else if (k === 'charge') {
    b.act.start = { x: b.x, y: b.y }; b.act.out = 0; b.act.back = false; b.act.hitIds = new Set();
    g.shake = Math.max(g.shake, 0.12);
  } else if (k === 'summon') {
    summon(g);
  } else if (k === 'ice') {
    g.ice.push({ x: b.x, y: b.y, r: d.range, t: 0, life: d.life, seed: Math.floor(g.rng() * 1e6) });
    if (g.ice.length > 3) g.ice.shift();
    g.rings.push({ x: b.x, y: b.y, r: 6, max: d.range, t: 0, col: 'ice' });
    for (let i = 0; i < 30; i++) { const a = g.rng() * TAU, s = 20 + g.rng() * 60; part(g, b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, Math.cos(a) * s, Math.sin(a) * s, 0.6, 'frost'); }
    for (const p of g.parties) if (p.engaged && p.type !== 'rider' && g.rng() < 0.6) { const u = alive(p)[2]; if (u) bark(g, u, pick(g, BARK.ice)); }
  } else if (k === 'haste') {
    b.haste = d.time;
    text(g, b.x, b.y - 20, 'ZOOMIES', 'gold', 1.2);
  } else if (k === 'beam') {
    g.shake = 0.3;
  }
}

// the stun charge: out along your heading, bowling over and stunning whoever you touch, then back to where you started
function chargeStep(g, a, d, dt) {
  const b = g.boss;
  if (!a.back) {
    const ox = b.x, oy = b.y;
    moveBoss(g, b.x + Math.cos(b.face) * d.speed * dt, b.y + Math.sin(b.face) * d.speed * dt);
    if (g.props.length || g.critters.length) {
      for (const p of P.near(g, b.x, b.y, b.r + 16)) {
        if (p.state !== 'up' || a.hitIds.has('p' + p.id) || !P.touches(p, b.x, b.y, b.r + 3)) continue;
        a.hitIds.add('p' + p.id);
        P.hitProp(g, p, d.dmg * 2, b.face);
      }
      P.bossTouch(g, ox, oy, dt);
    }
    const moved = Math.hypot(b.x - ox, b.y - oy);
    a.out += moved;
    if (a.out >= d.range || moved < d.speed * dt * 0.3) { a.back = true; a.pause = 0.15; }
    if (g.rng() < 0.7) part(g, b.x - Math.cos(b.face) * 10, b.y - Math.sin(b.face) * 10, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.4, 'dust');
    for (const u of g.units) {
      if (!hittable(u) || a.hitIds.has(u.id) || Math.hypot(u.x - b.x, u.y - b.y) > b.r + 5) continue;
      a.hitIds.add(u.id);
      hurt(g, u, d.dmg);
      if (u.dead) continue;
      stun(g, u, d.stun);
      const side = (-(u.x - b.x) * Math.sin(b.face) + (u.y - b.y) * Math.cos(b.face)) >= 0 ? 1 : -1;
      u.kx += -Math.sin(b.face) * side * d.kb * 5; u.ky += Math.cos(b.face) * side * d.kb * 5;
    }
    return;
  }
  if (a.pause > 0) { a.pause -= dt; return; }
  const dx = a.start.x - b.x, dy = a.start.y - b.y, dist = Math.hypot(dx, dy);
  const s = Math.min(dist, d.speed * 0.8 * dt);
  const ox = b.x, oy = b.y;
  if (dist > 0.5) moveBoss(g, b.x + dx / dist * s, b.y + dy / dist * s);
  if (g.props.length || g.critters.length) P.bossTouch(g, ox, oy, dt);
  if (dist <= 0.5 || s < 0.01 || Math.hypot(b.x - ox, b.y - oy) < s * 0.3) b.act = null;
}

function stun(g, u, t) {
  if (u.role === 'rider') {
    if (u.mounted) { u.mounted = false; u.horse.tx = clamp(u.x + (g.rng() - 0.5) * 60, AR.x0 + 15, AR.x1 - 15); u.horse.ty = clamp(u.y + (g.rng() - 0.5) * 40, AR.y0 + 10, AR.y1 - 10); }
    u.state = 'stun'; u.stunT = t + 0.8;
    return;
  }
  u.stun = t;
  u.cast = 0;
}

export const zoneFace = (g, k) => g.boss.face + (g.abil[k].back ? Math.PI : 0);

export function inZone(g, k, x, y, pad = 0) {
  const b = g.boss, d = g.abil[k];
  const dx = x - b.x, dy = y - b.y, dist = Math.hypot(dx, dy);
  if (k === 'charge' || k === 'beam') {
    // a lane straight ahead
    const c = Math.cos(b.face), s = Math.sin(b.face), lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const len = k === 'beam' ? beamEnd(g).len : d.range;
    return lx > (k === 'beam' ? 6 : -4) && lx < len + pad && Math.abs(ly) < d.width + pad;
  }
  if (dist > d.range + pad) return false;
  if (k === 'stomp' || k === 'roar' || k === 'shake') return true;
  if (dist < 6) return true;
  return Math.abs(angDiff(Math.atan2(dy, dx), zoneFace(g, k))) < d.arc / 2 + pad / dist;
}

// which telegraph the adventurers are currently trying to get out of
export function telegraph(g) {
  const a = g.boss.act;
  if (!a) return null;
  if (a.kind === 'breath' || a.kind === 'beam') return a.kind;
  if ((a.kind === 'swipe' || a.kind === 'stomp' || a.kind === 'tail' || a.kind === 'charge') && !a.fired) return a.kind;
  return null;
}

function hurtBoss(g, amt, u) {
  const b = g.boss;
  if (b.evade || b.dead || g.walkoff) return;   // nothing touches you on the way out
  b.hp -= amt * (1 + NG_HIT * g.ng);
  b.flash = 0.06;
  b.calmT = 0;
  g.blame[u.party.type] += amt;
  u.party.hitT = g.t;
  if (b.hp <= 0) {
    b.hp = 0; b.dead = true; b.act = null; b.taunt = null;
    g.events.push('bossdie');
    g.shake = 0.6;
    for (const p of g.parties) for (const v of alive(p)) if (g.rng() < 0.35) bark(g, v, pick(g, BARK.dance));
  }
}

// ---------------------------------------------------------------------------------------------- director

function edgeSpot(g, avoid) {
  for (let tries = 0; ; tries++) {
    // a level can shut some edges (map.edges, e.g. [0, 1, 3]) and narrow the side band (map.sideBand: [y0, y1] on screen)
    const sides = g.map.edges, s = sides ? sides[Math.floor(g.rng() * sides.length)] : Math.floor(g.rng() * 4);
    const along = g.rng(), sb = g.map.sideBand || [40, 140], sy = V.y + sb[0] + along * (sb[1] - sb[0]);
    let e;
    if (s === 0) e = { x: V.x - 8, y: sy, nx: 1, ny: 0 };
    else if (s === 1) e = { x: V.x + W + 8, y: sy, nx: -1, ny: 0 };
    else if (s === 2) e = { x: V.x + 30 + along * 260, y: V.y + 6, nx: 0, ny: 1 };
    else e = { x: V.x + 30 + along * 260, y: V.y + H + 4, nx: 0, ny: -1 };
    if (!avoid || tries > 6 || Math.hypot(e.x - g.boss.x, e.y - g.boss.y) > 110) return e;
  }
}

// 5-mans and horse guys all level long. On patrol, a 25-man raid from lap 10 and the 40-man at lap 20; on chaos levels
// the same at Chaos 50% and 100%; after the 40-man nothing else comes. Timed levels get a raid every couple of minutes.
function director(g) {
  const d = g.dir, mode = g.map.mode;
  if (g.boss.dead || d.final || g.clear || g.won) return;
  const raidUp = g.parties.some(p => p.type === 'raid');
  if (mode === 'timed') {
    if (!raidUp && g.t - g.levelT0 > 55 && g.t - d.lastRaid > 110) { spawnRaid(g, d.raids % 3 === 2 ? 40 : 25); d.lastRaid = g.t; return; }
  } else {
    const prog = mode === 'patrol' ? g.lapsMap / FINAL_LAPS : g.chaos;
    if (prog >= 1) { d.final = true; spawnRaid(g, 40, true); return; }
    if (prog >= RAID_LAPS / FINAL_LAPS && !raidUp && g.t - d.lastRaid > (d.raids ? 80 : 0)) { spawnRaid(g, 25); d.lastRaid = g.t; return; }
  }
  if (g.t < d.next) return;
  if (g.units.length > 60 || g.boss.evade) { d.next = g.t + 4; return; }
  const riders = g.parties.filter(p => p.type === 'rider').length;
  let type = ['dungeon', 'rider', 'dungeon'][d.n];
  if (!type) type = riders < (g.map.n > 2 ? 2 : 1) && g.rng() < 0.3 ? 'rider' : 'dungeon';
  if (type === 'rider') spawnRider(g);
  else { spawnDungeon(g); if (d.n > 6 && g.rng() < 0.3) spawnDungeon(g, true); }
  d.n++;
  d.next = g.t + (Math.max(14, 30 - d.n * 1.2 - g.map.n * 2) + g.rng() * 8) / (1 + NG_PACE * g.ng);
}

export function newParty(g, type) {
  // every party is a little better geared than the last, and every map is harder than the one before
  const power = type === 'rider' ? 1 : 1 + (g.map.n - 1) * 0.28 + (type === 'raid' ? g.dir.raids * 0.05 : g.dir.n * 0.05);
  const p = { id: g.nextId++, type, power, units: [], skill: SKILL[type], engaged: false, done: false, fleeing: false, t: 0, brez: 0, deadList: [], barkT: 3 };
  g.parties.push(p);
  return p;
}

export function mkUnit(g, p, cls, x, y) {
  const c = CLASS[cls];
  const u = {
    id: g.nextId++, party: p, cls, role: c.role, x, y, hp: c.hp * p.power * (1 + NG_HP * g.ng), maxhp: c.hp * p.power * (1 + NG_HP * g.ng), spd: c.spd, atk: g.rng() * c.rate, cast: 0,
    state: 'travel', kx: 0, ky: 0, hit: 0, dead: false, gone: false, moving: false, fx: 1, walk: g.rng() * 10,
    slotA: 0, slotD: 0, fear: 0, stun: 0, slow: 1, react: Infinity, willDodge: false, inFire: false, fireOk: false, tauntCd: 4 + g.rng() * 6,
  };
  g.units.push(u); p.units.push(u);
  return u;
}

function spawnDungeon(g, quiet) {
  const p = newParty(g, 'dungeon');
  const e = edgeSpot(g, true);
  const base = Math.atan2(e.y - g.boss.y, e.x - g.boss.x);
  const comp = ['warrior', g.rng() < 0.5 ? 'priest' : 'druid', g.rng() < 0.5 ? 'rogue' : 'berserker', 'mage', 'hunter'];
  comp.forEach((cls, i) => {
    const u = mkUnit(g, p, cls, e.x - e.nx * i * 3 + (g.rng() - 0.5) * 8, e.y - e.ny * i * 3 + (g.rng() - 0.5) * 8);
    u.slotA = u.role === 'melee' ? (g.rng() - 0.5) * 1.6 : base + (g.rng() - 0.5) * 1.6;
    u.slotD = u.role === 'healer' ? 52 + g.rng() * 8 : u.role === 'ranged' ? 44 + g.rng() * 12 : g.rng() * 3;
    u.home = { x: u.x + e.nx * 14, y: u.y + e.ny * 14 };
    if (cls === 'hunter') {
      const pet = mkUnit(g, p, 'pet', u.x, u.y);
      pet.slotA = (g.rng() - 0.5) * 2;
      pet.state = 'pull';
    }
  });
  const afk = alive(p).filter(u => u.role === 'ranged' || u.role === 'melee');
  if (g.rng() < 0.55) { const u = pick(g, afk); u.state = 'afk'; u.afk = 7 + g.rng() * 6; }
  if (!quiet) banner(g, 'A 5-MAN HAS ZONED IN', 'TANK, HEALER, THREE DPS. ONE IS AFK.');
  g.events.push('horn');
}

function spawnRaid(g, size, final) {
  const p = newParty(g, 'raid');
  p.final = !!final;
  p.brez = final ? 2 : 1;
  g.dir.raids++;
  const e = edgeSpot(g, true);
  const cols = size <= 25 ? 5 : Math.ceil(Math.sqrt(size * 1.4)), sp = size <= 25 ? 6 : 5;
  const half = (cols - 1) / 2 * sp, depth = (Math.ceil(size / cols) - 1) * sp * 0.8;
  // staging spot just inside the edge they came from, with the whole block clear of the HUD
  let sx = clamp(e.x + e.nx * 40, V.x + 40, V.x + W - 40), sy = clamp(e.y + e.ny * 40, V.y + 48, V.y + H - 62);
  if (e.nx) sy = clamp(sy, V.y + 38 + half, V.y + H - 44 - half);
  else { sx = clamp(sx, V.x + 12 + half, V.x + W - 12 - half); sy = e.ny > 0 ? Math.max(sy, V.y + 38 + depth) : Math.min(sy, V.y + H - 30 - depth); }
  sx = clamp(sx, AR.x0 + 10, AR.x1 - 10); sy = clamp(sy, AR.y0 + 10, AR.y1 - 10);
  p.stage = { x: sx, y: sy };
  const base = Math.atan2(sy - g.boss.y, sx - g.boss.x);
  const comp = raidComp(size);
  const nMelee = comp.filter(c => CLASS[c].role === 'melee').length;
  const px = -e.ny, py = e.nx;   // along the edge
  let tank = 0, mi = 0;
  comp.forEach((cls, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const ox = (col - (cols - 1) / 2) * sp, oy = row * sp;
    const u = mkUnit(g, p, cls, e.x + px * ox - e.nx * oy, e.y + py * ox - e.ny * oy);
    u.stage = { x: sx + px * ox - e.nx * oy * 0.8, y: sy + py * ox - e.ny * oy * 0.8 };
    if (u.role === 'tank') u.slot = tank++;
    u.slotA = u.role === 'melee' ? ((mi++) / Math.max(1, nMelee - 1) - 0.5) * 2.2 : base + (g.rng() - 0.5) * 2.6;
    u.slotD = u.role === 'healer' ? 54 + g.rng() * 10 : u.role === 'ranged' ? 44 + g.rng() * 16 : g.rng() * 4;
  });
  p.leader = p.units[0];
  if (final) banner(g, 'A 40-MAN RAID HAS ENTERED', 'THE BIG ONE. NOTHING ELSE IS COMING.', 4);
  else banner(g, `A ${size}-MAN RAID HAS ENTERED`, 'THEY HAVE WATCHED A GUIDE.');
  g.events.push('raidhorn');
}

function spawnRider(g) {
  const p = newParty(g, 'rider');
  const e = edgeSpot(g, false);
  const u = mkUnit(g, p, 'rider', e.x, e.y);
  u.state = 'arrive'; u.mounted = true; u.grip = 100; u.hface = 0;
  u.horse = { x: e.x, y: e.y, face: 0, walk: 0 };
  p.engaged = true;
  banner(g, 'A QUIET MAN ON A HORSE', 'HE WANTS TO CLIMB YOUR FUR.');
  g.events.push('neigh');
}

// the class list of a raid of a given size: tanks, a fifth healers, the rest DPS, melee and ranged alternating
function raidComp(size) {
  const tanks = 2 + Math.floor((size - 25) / 15), healers = Math.round(size * 0.2), dps = size - tanks - healers;
  const melee = ['rogue', 'berserker', 'paladin'], ranged = ['mage', 'warlock', 'hunter'];
  const comp = [];
  for (let i = 0; i < tanks; i++) comp.push('warrior');
  for (let i = 0; i < healers; i++) comp.push(i % 2 ? 'druid' : 'priest');
  for (let i = 0; i < dps; i++) comp.push(i % 2 ? ranged[(i >> 1) % 3] : melee[(i >> 1) % 3]);
  return comp;
}

// heroes stationed at a post (see LAPI.garrison), in a loose block around (x, y)
function garrison(g, o) {
  const size = o.size || 5, raid = size > 5;
  const p = newParty(g, raid ? 'raid' : 'dungeon');
  if (o.power) p.power = o.power;
  p.post = { x: o.x, y: o.y };
  p.guard = o.guard || (raid ? 60 : 56);
  p.leash = o.leash || (raid ? 150 : 120);
  if (raid) { p.brez = 1; g.dir.raids++; }
  const comp = raid ? raidComp(size) : ['warrior', g.rng() < 0.5 ? 'priest' : 'druid', g.rng() < 0.5 ? 'rogue' : 'berserker', 'mage', 'hunter'];
  const cols = raid ? Math.ceil(Math.sqrt(size * 1.4)) : 3, sp = o.spread || (raid ? 5 : 6), rows = Math.ceil(comp.length / cols);
  const face = Math.atan2(g.boss.y - o.y, g.boss.x - o.x);
  const nMelee = comp.filter(c => CLASS[c].role === 'melee').length;
  let tank = 0, mi = 0;
  comp.forEach((cls, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const x = o.x + (col - (cols - 1) / 2) * sp + (g.rng() - 0.5) * 1.5, y = o.y + (row - (rows - 1) / 2) * sp * 0.8;
    const u = mkUnit(g, p, cls, x, y);
    u.state = 'post'; u.post = { x, y }; u.fx = Math.cos(face) >= 0 ? 1 : -1;
    if (u.role === 'tank') u.slot = tank++;
    u.slotA = u.role === 'melee' ? (raid ? ((mi++) / Math.max(1, nMelee - 1) - 0.5) * 2.2 : (g.rng() - 0.5) * 1.6) : face + Math.PI + (g.rng() - 0.5) * 2.2;
    u.slotD = u.role === 'healer' ? 52 + g.rng() * 10 : u.role === 'ranged' ? 44 + g.rng() * 14 : g.rng() * 3;
    if (cls === 'hunter' && !raid) { const pet = mkUnit(g, p, 'pet', x + 2, y + 1); pet.state = 'post'; pet.post = { x: x + 2, y: y + 1 }; pet.slotA = (g.rng() - 0.5) * 2; }
  });
  p.leader = p.units[0];
  return p;
}

function spawnKing(g, o) {
  const p = newParty(g, 'dungeon');
  p.king = true; p.post = { x: o.x, y: o.y }; p.power = 1;
  p.skill = { react: 0.9, dodge: 0.15, fire: 0 };
  const u = mkUnit(g, p, 'king', o.x, o.y);
  u.hp = u.maxhp = o.hp || CLASS.king.hp;
  u.state = 'post'; u.post = { x: o.x, y: o.y }; u.king = true;
  return u;
}

function scatter(g, p) {
  p.fleeing = true;
  for (const u of alive(p)) { u.state = 'flee'; u.exit = nearestExit(u); u.fear = 0; }
}

// ---------------------------------------------------------------------------------------------- parties

const alive = p => p.units.filter(u => !u.dead && !u.gone);

function engage(g, p, why) {
  if (p.engaged) return;
  p.engaged = true; p.engT = g.t;
  p.countdown = null;
  for (const u of p.units) if ((u.state === 'travel' || u.state === 'stage' || u.state === 'post') && u.role !== 'king') u.state = 'fight';
  g.events.push('engage');
  const u = alive(p).find(v => v.role !== 'pet');
  if (u) bark(g, u, why === 'pet' ? pick(g, BARK.pet) : why === 'early' ? pick(g, BARK.pull) : p.type === 'raid' ? 'GO GO GO' : 'GOGO');
}

function updateParty(g, p, dt) {
  p.t += dt;
  const live = alive(p);
  if (!live.length) { finishParty(g, p); return; }
  if (p.type === 'rider') return;
  const b = g.boss;

  if (p.post && !g.clear && !g.won) {
    // a garrison: stays home until the boss comes close, and goes back once it has been led too far away
    if (p.king) return;
    // (or once it has spent 8 s engaged without landing a single blow: stuck behind a wall, say)
    if (p.engaged && !p.fleeing && (Math.hypot(b.x - p.post.x, b.y - p.post.y) > p.leash || g.t - Math.max(p.engT || 0, p.hitT || 0) > 8)) {
      p.engaged = false;
      for (const u of live) if (u.state === 'fight' || u.state === 'afk') { u.state = 'post'; u.foe = null; }
      if (g.rng() < 0.5) bark(g, live[0], pick(g, BARK.reset));
    } else if (!p.engaged) {
      const near = live.find(u => Math.hypot(u.x - b.x, u.y - b.y) < p.guard);
      if (near && Math.hypot(b.x - p.post.x, b.y - p.post.y) < p.leash * 0.8) engage(g, p, near.role === 'pet' ? 'pet' : 'near');
      return;
    }
  }
  if (!p.engaged && !g.clear) {
    // anyone wandering too close, or a pet with ideas, starts the fight
    const near = live.find(u => u.state !== 'afk' && Math.hypot(u.x - b.x, u.y - b.y) < (p.type === 'raid' ? 52 : ENGAGE_R));
    if (near) engage(g, p, near.role === 'pet' ? 'pet' : p.type === 'raid' ? 'early' : 'near');
    else if (p.type === 'raid') {
      const staged = (live.every(u => u.state === 'stage') && p.t > 5) || p.t > 10;
      if (staged && !p.countdown) { p.countdown = 5.99; }
      if (p.countdown) {
        const before = Math.ceil(p.countdown);
        p.countdown -= dt;
        if (Math.ceil(p.countdown) !== before && p.countdown > 0) { g.events.push('tick'); banner(g, `PULL IN ${Math.ceil(p.countdown)}`, null, 1.1); }
        if (p.countdown <= 0) engage(g, p, 'timer');
      }
    }
  }

  // chatter: whatever fits the moment, else the usual
  p.barkT -= dt;
  if (p.barkT <= 0) {
    p.barkT = (p.type === 'raid' ? 2.6 : 4) + g.rng() * 3;
    const u = pick(g, live);
    if (u.role !== 'pet' && !g.clear) {
      let list = p.type === 'raid' ? (p.engaged ? BARK.raidFight : BARK.raidIdle) : (p.engaged ? BARK.dungeonFight : BARK.dungeonIdle);
      if (p.engaged && g.adds.length && g.rng() < 0.3) list = BARK.adds;
      if (p.engaged && b.hp < b.maxhp * 0.3 && g.rng() < 0.4) list = BARK.execute;
      bark(g, u, pick(g, list));
    }
  }

  // the battle res
  if (p.brez > 0 && p.engaged && !p.fleeing && p.deadList.length) {
    const healer = live.find(u => u.role === 'healer');
    const c = p.deadList.find(c => g.t - c.t > 4 && g.corpses.some(k => k.u === c.u));
    if (healer && c && g.rng() < 0.3 * dt) {
      p.brez--;
      p.deadList.splice(p.deadList.indexOf(c), 1);
      const u = c.u;
      u.dead = false; u.hp = u.maxhp * 0.5; u.state = 'fight'; u.x = c.x; u.y = c.y; u.fear = 0; u.stun = 0;
      g.units.push(u);
      g.corpses = g.corpses.filter(k => k.u !== u);
      bark(g, healer, 'BREZ!');
      for (let i = 0; i < 12; i++) { const a = g.rng() * TAU; part(g, u.x, u.y - 2, Math.cos(a) * 18, Math.sin(a) * 18 - 10, 0.6, 'heal'); }
      g.events.push('rez');
    }
  }

  // morale: a raid with only a few left, or with nobody left to stand in front, may give up. A raid that decided
  // to stay thinks again every 12 s, so a handful of casters can never hold a map open forever.
  p.fleeT = (p.fleeT || 0) - dt;
  if (p.engaged && p.fleeing !== true && p.fleeT <= 0) {
    const noFront = p.type === 'raid' && live.length <= p.units.length * 0.35 && !live.some(u => u.role === 'tank' || u.role === 'melee');
    const few = p.type === 'raid' ? live.length <= Math.max(3, Math.round(p.units.length * 0.12)) : (live.length === 1 && live[0].role === 'healer' && p.units.length > 2);
    if ((few || noFront) && (noFront || g.rng() < 0.55)) {
      p.fleeing = true;
      bark(g, live[0], noFront ? 'NO TANK. WIPE IT' : p.type === 'raid' ? pick(g, BARK.flee) : 'NOPE');
      for (const u of live) { u.state = 'flee'; u.exit = nearestExit(u); }
    } else if (few) { p.fleeing = 'no'; p.fleeT = 12; }
  }
}

function finishParty(g, p) {
  p.done = true;
  if (p.king) return;   // the level makes its own fuss about the king
  const esc = p.units.filter(u => u.gone).length;
  if (p.final && !g.boss.dead) { mapCleared(g, esc); return; }
  if (esc && (g.boss.dead || g.clear || g.won)) return;
  if (p.type === 'rider') {
    if (esc) return;
    g.wipes.rider++;
    banner(g, 'HORSE GUY DEFEATED', 'THE HORSE SEEMS RELIEVED.');
    g.events.push('wipe');
    return;
  }
  if (esc) {
    banner(g, esc === 1 ? 'ONE GOT AWAY' : `${esc} GOT AWAY`, 'NO WIPE BONUS. THEY WILL TELL OTHERS.');
    return;
  }
  const pts = Math.round(WIPE[p.type] * g.mult);
  addScore(g, pts);
  g.wipes[p.type]++;
  banner(g, p.type === 'raid' ? 'RAID WIPED' : 'PARTY WIPED', `+${pts}` + (p.type === 'raid' ? '  SEE YOU NEXT RESET' : ''));
  g.events.push('wipe');
}

// the 40-man is done: everyone else logs off, and the store opens once the field is empty
function mapCleared(g, esc) {
  if (g.clear) return;
  g.clear = { t: 0 };
  const pts = esc ? 0 : Math.round(WIPE.final * g.mult);
  if (pts) { addScore(g, pts); g.wipes.final++; }
  banner(g, 'LEVEL CLEARED', pts ? `+${pts}. THE HOARD OPENS IN A MOMENT.` : 'SOME GOT AWAY. THE HOARD OPENS IN A MOMENT.', 5);
  g.events.push('clear');
  sendHome(g);
}

// a level that ends some other way (a wall knocked down, the castle reached)
function levelCleared(g, title = 'LEVEL CLEARED', sub = 'THE HOARD OPENS IN A MOMENT.') {
  if (g.clear || g.won) return;
  g.clear = { t: 0 };
  banner(g, title, sub, 5);
  g.events.push('clear');
  sendHome(g);
}

// the castle is down: every hero left runs, and after a moment the game is won
function winGame(g) {
  if (g.won) return;
  g.won = true; g.winT = 0; g.dir.final = true;
  banner(g, 'THE KINGDOM IS RUBBLE', 'EVERY HERO LEFT IS RUNNING. YOU WIN.', 7);
  g.events.push('clear');
  sendHome(g);
}

function sendHome(g) {
  g.boss.act = null; g.boss.taunt = null;
  for (const u of g.units) {
    if (u.dead || u.gone) continue;
    if (u.role === 'rider') { u.state = 'leave'; u.mounted = true; u.exit = nearestExit(u); continue; }
    u.state = 'flee'; u.exit = nearestExit(u); u.fear = 0; u.stun = 0;
    if (g.rng() < 0.15) bark(g, u, pick(g, BARK.logoff));
  }
}

function nearestExit(u) {
  const opts = [{ x: V.x - 12, y: u.y }, { x: V.x + W + 12, y: u.y }, { x: u.x, y: V.y - 12 }, { x: u.x, y: V.y + H + 12 }];
  return opts.reduce((a, c) => Math.hypot(c.x - u.x, c.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? c : a);
}

// ---------------------------------------------------------------------------------------------- units

function moveTo(u, tx, ty, spd, dt) {
  spd *= u.slow ?? 1;
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d < 0.6) { u.moving = false; return true; }
  const s = Math.min(d, spd * dt);
  u.x += dx / d * s; u.y += dy / d * s;
  u.moving = true;
  if (Math.abs(dx) > 0.3) u.fx = dx > 0 ? 1 : -1;
  u.walk += s * 0.5;
  return d < 2;
}
function moveDir(u, dx, dy, spd, dt) {
  spd *= u.slow ?? 1;
  const d = Math.hypot(dx, dy) || 1;
  u.x += dx / d * spd * dt; u.y += dy / d * spd * dt;
  u.moving = true;
  if (Math.abs(dx) > 0.1) u.fx = dx > 0 ? 1 : -1;
  u.walk += spd * dt * 0.5;
}
function clampArena(u) {
  u.x = clamp(u.x, AR.x0, AR.x1);
  u.y = clamp(u.y, AR.y0 - 6, AR.y1 + 8);
}
const hittable = u => !u.dead && !u.gone && !(u.role === 'rider' && u.state === 'climb');

function knock(u, b, kb) {
  const dx = u.x - b.x, dy = u.y - b.y, d = Math.hypot(dx, dy) || 1;
  u.kx += dx / d * kb * 5; u.ky += dy / d * kb * 5;
}

function escapeDir(g, k, u) {
  const b = g.boss, d = g.abil[k];
  const dx = u.x - b.x, dy = u.y - b.y, dist = Math.hypot(dx, dy) || 1;
  if (k === 'stomp') return { x: dx / dist, y: dy / dist };
  if (k === 'charge' || k === 'beam') { const s = (-dx * Math.sin(b.face) + dy * Math.cos(b.face)) >= 0 ? 1 : -1; return { x: -Math.sin(b.face) * s, y: Math.cos(b.face) * s }; }
  const f = zoneFace(g, k);
  const ad = angDiff(Math.atan2(dy, dx), f);
  const radial = d.range + 4 - dist;
  const lateral = dist * (d.arc / 2 + 0.2 - Math.abs(ad));
  if (lateral < radial) { const s = ad >= 0 ? 1 : -1; return { x: -Math.sin(f) * s, y: Math.cos(f) * s }; }
  return { x: dx / dist, y: dy / dist };
}

function fireAt(g, x, y) {
  for (const f of g.fires) if (f.t < f.life - 0.4 && Math.hypot(x - f.x, y - f.y) < f.r) return f;
  return null;
}
export function onIce(g, x, y) {
  for (const i of g.ice) if (i.t < i.life - 0.5 && Math.hypot(x - i.x, y - i.y) < i.r) return true;
  return false;
}

function fightSpot(g, u) {
  const b = g.boss;
  let a, d;
  if (u.role === 'tank') { a = b.face + [0, 0.95, -0.95, 0.5, -0.5][(u.slot || 0) % 5]; d = b.r + 5; }
  else if (u.role === 'melee' || u.role === 'pet') { a = b.face + Math.PI + u.slotA; d = b.r + 4 + u.slotD; }
  else { a = u.slotA; d = u.slotD; }
  return { x: clamp(b.x + Math.cos(a) * d, AR.x0, AR.x1), y: clamp(b.y + Math.sin(a) * d, AR.y0, AR.y1) };
}

function updateUnit(g, u, dt) {
  const b = g.boss, p = u.party;
  u.hit = Math.max(0, u.hit - dt);
  u.x += u.kx * dt; u.y += u.ky * dt;
  const k = Math.exp(-9 * dt); u.kx *= k; u.ky *= k;
  u.slow = (onIce(g, u.x, u.y) ? 0.4 : 1) * (g.props.length ? P.slowAt(g, u.x, u.y) : 1);
  if (u.role === 'rider') { updateRider(g, u, dt); return; }
  if (b.dead) { u.moving = false; u.dance = (u.dance || g.rng() * 3) + dt; return; }

  // fire on the ground
  const f = fireAt(g, u.x, u.y);
  if (f) {
    if (!u.inFire) {
      u.inFire = true;
      u.fireOk = g.rng() < p.skill.fire;
      if (u.fireOk && g.rng() < 0.6) bark(g, u, pick(g, BARK.fire));
    }
    hurt(g, u, 32 * dt);
    if (u.dead) return;
  } else u.inFire = false;

  if (u.stun > 0) { u.stun -= dt; u.moving = false; u.cast = 0; return; }
  if (u.state === 'flee') {
    moveTo(u, u.exit.x, u.exit.y, u.spd * 0.95, dt);
    if (u.x < V.x - 10 || u.x > V.x + W + 10 || u.y < V.y - 10 || u.y > V.y + H + 10) { u.gone = true; if (!g.clear) g.escaped++; }
    return;
  }
  if (u.fear > 0) {
    u.fear -= dt; u.cast = 0;
    moveDir(u, u.x - b.x + Math.sin(g.t * 3 + u.id) * 20, u.y - b.y + Math.cos(g.t * 3 + u.id) * 20, u.spd * 1.1, dt);
    clampArena(u);
    return;
  }

  // telegraphs: get out (if you saw it, and you are the kind of person who moves)
  const tele = telegraph(g);
  if (tele && u.state !== 'afk') {
    const inside = inZone(g, tele, u.x, u.y, 4);
    if ((tele === 'breath' || tele === 'beam') && inside && !u.inCone) u.react = Math.max(u.react, g.t + p.skill.react * (0.4 + g.rng() * 0.5));
    u.inCone = inside;
    if (inside && u.willDodge && g.t >= u.react) {
      const e = escapeDir(g, tele, u);
      moveDir(u, e.x, e.y, u.spd * 1.8, dt);
      u.cast = 0;
      clampArena(u);
      return;
    }
  } else u.inCone = false;
  if (f && !u.fireOk) { moveDir(u, u.x - f.x, u.y - f.y, u.spd * 1.3, dt); u.cast = 0; return; }

  switch (u.state) {
    case 'afk':
      u.moving = false;
      u.afk -= dt;
      if (u.afk <= 0) { u.state = p.engaged ? 'fight' : 'travel'; bark(g, u, 'BACK'); }
      else if (!u.saidBrb && p.t > 1) { u.saidBrb = true; bark(g, u, 'BRB'); }
      if (u.home) moveTo(u, u.home.x, u.home.y, u.spd, dt);
      return;
    case 'pull': {
      moveTo(u, b.x, b.y, u.spd, dt);
      if (Math.hypot(u.x - b.x, u.y - b.y) < b.r + 8) { u.state = 'fight'; engage(g, p, 'pet'); }
      return;
    }
    case 'travel':
      if (p.type === 'raid') { if (moveTo(u, u.stage.x, u.stage.y, u.spd, dt)) u.state = 'stage'; }
      else moveTo(u, b.x, b.y, u.spd, dt);
      return;
    case 'stage':
      u.moving = false;
      return;
    case 'post': {
      // standing guard. A king keeps his distance from the boss, but never wanders far from his post.
      let tx = u.post.x, ty = u.post.y;
      const db = Math.hypot(u.x - b.x, u.y - b.y), shy = u.role === 'king' && db < 70;
      if (shy) {
        const l = db || 1, k = (70 - db) * 0.6;
        tx = clamp(u.x + (u.x - b.x) / l * k, u.post.x - 34, u.post.x + 34); ty = clamp(u.y + (u.y - b.y) / l * k, u.post.y - 22, u.post.y + 22);
        if (db < 44 && g.rng() < 0.5 * dt) bark(g, u, pick(g, BARK.king));
      }
      if (Math.hypot(tx - u.x, ty - u.y) > 1.5) moveTo(u, tx, ty, u.spd, dt);
      else u.moving = false;
      clampArena(u);
      return;
    }
  }

  // one of the boss's adds is in the way: deal with it first
  u.foeT = (u.foeT || 0) - dt;
  if (u.foeT <= 0) { u.foeT = 0.4 + g.rng() * 0.4; u.foe = pickFoe(g, u); }
  if (u.foe?.dead) u.foe = null;
  if (u.foe) { fightAdd(g, u, u.foe, dt); return; }

  // fight
  const s = fightSpot(g, u);
  const dist = Math.hypot(u.x - b.x, u.y - b.y);
  let there;
  if (u.role === 'ranged' || u.role === 'healer') {
    // casters plant their feet and only move when the spot has drifted a long way, or the boss is on top of them
    if (u.repos || Math.hypot(s.x - u.x, s.y - u.y) > 16 || dist < 22) u.repos = !moveTo(u, s.x, s.y, u.spd, dt);
    else u.moving = false;
    there = !u.repos;
  } else there = moveTo(u, s.x, s.y, u.spd, dt);
  clampArena(u);
  const c = CLASS[u.cls];
  if (u.role === 'tank' || u.role === 'melee' || u.role === 'pet') {
    if (dist < b.r + 7) {
      u.atk -= dt;
      if (u.atk <= 0) {
        u.atk = c.rate * (0.85 + g.rng() * 0.3);
        u.swing = 0.15;
        hurtBoss(g, c.dmg * p.power, u);
        if (g.rng() < 0.5) part(g, b.x + (u.x - b.x) * 0.7, b.y + (u.y - b.y) * 0.7, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.25, 'fur');
      }
    }
    if (u.role === 'tank') {
      u.tauntCd -= dt;
      if (u.tauntCd <= 0 && dist < 34 && !b.taunt && !b.evade && !(b.act?.kind === 'charge')) {
        u.tauntCd = 9 + g.rng() * 6;
        b.taunt = { u, t: 1.2 };
        g.events.push('taunt');
        text(g, u.x, u.y - 8, 'TAUNT', 'steelHi', 1);
      }
    }
  } else if (u.role === 'ranged') {
    if (there && dist < 84) {
      u.cast += dt;
      if (u.cast >= c.rate) {
        u.cast = 0;
        g.bolts.push({ x: u.x, y: u.y - 3, dmg: c.dmg * p.power, kind: c.bolt, u, t: 0 });
      }
    } else u.cast = 0;
  } else if (u.role === 'healer') {
    u.cast += dt;
    if (u.cast >= c.rate) {
      const tgt = alive(p).filter(v => v.hp < v.maxhp * 0.97 && Math.hypot(v.x - u.x, v.y - u.y) < 110)
        .sort((x, y) => x.hp / x.maxhp - y.hp / y.maxhp)[0];
      if (tgt) {
        u.cast = 0;
        tgt.hp = Math.min(tgt.maxhp, tgt.hp + c.heal * p.power);
        u.glow = 0.4;
        for (let i = 0; i < 4; i++) part(g, tgt.x + (g.rng() - 0.5) * 4, tgt.y - 2, 0, -10 - g.rng() * 10, 0.6, 'heal');
      } else u.cast = c.rate;
    }
  }
  u.swing = Math.max(0, (u.swing || 0) - dt);
  u.glow = Math.max(0, (u.glow || 0) - dt);
}

// ---------------------------------------------------------------------------------------------- the horse guy

function updateRider(g, u, dt) {
  const b = g.boss, h = u.horse;
  if (b.dead && u.state !== 'leave') { u.state = 'leave'; u.exit = nearestExit(u); u.mounted = true; }
  const ride = (tx, ty, spd) => {
    const ox = u.x, oy = u.y;
    moveTo(u, tx, ty, spd, dt);
    if (Math.hypot(u.x - ox, u.y - oy) > 0.01) h.face = Math.atan2(u.y - oy, u.x - ox);
    h.x = u.x; h.y = u.y; h.walk += Math.hypot(u.x - ox, u.y - oy);
  };
  const dodge = () => {
    const tele = telegraph(g);
    if (!tele) return false;
    if (inZone(g, tele, u.x, u.y, 6) && u.willDodge && g.t >= u.react) {
      const e = escapeDir(g, tele, u);
      ride(u.x + e.x * 20, u.y + e.y * 20, HORSE_SPD * 1.2);
      return true;
    }
    return false;
  };
  u.stab = Math.max(0, (u.stab || 0) - dt);

  switch (u.state) {
    case 'arrive': {
      const a = Math.atan2(u.y - b.y, u.x - b.x);
      ride(b.x + Math.cos(a) * 46, b.y + Math.sin(a) * 46, HORSE_SPD);
      if (Math.hypot(u.x - b.x, u.y - b.y) < 52) { u.state = 'orbit'; u.orbitT = 2.5 + g.rng() * 2; u.orbitDir = g.rng() < 0.5 ? -1 : 1; u.orbitA = a; }
      break;
    }
    case 'orbit': {
      if (dodge()) break;
      if (u.fear > 0) { u.fear -= dt; ride(u.x + (u.x - b.x), u.y + (u.y - b.y), HORSE_SPD); clampArena(u); break; }
      u.orbitA += u.orbitDir * 1.3 * dt;
      ride(clamp(b.x + Math.cos(u.orbitA) * 44, AR.x0, AR.x1), clamp(b.y + Math.sin(u.orbitA) * 44, AR.y0, AR.y1), HORSE_SPD);
      u.orbitT -= dt;
      if (u.orbitT <= 0) { u.state = 'charge'; if (g.rng() < 0.4) bark(g, u, '...'); }
      break;
    }
    case 'charge': {
      if (dodge()) break;
      const tx = b.x - Math.cos(b.face) * (b.r + 1), ty = b.y - Math.sin(b.face) * (b.r + 1);
      ride(tx, ty, HORSE_SPD * 1.15);
      if (Math.hypot(u.x - b.x, u.y - b.y) < b.r + 4 && !b.evade) {
        // grab the fur
        u.state = 'climb'; u.mounted = false; u.grip = 100;
        const dx = u.x - b.x, dy = u.y - b.y, c = Math.cos(-b.face), s = Math.sin(-b.face);
        let lx = dx * c - dy * s, ly = dx * s + dy * c;
        const l = Math.hypot(lx, ly) || 1; lx = lx / l * 9; ly = ly / l * 8;
        u.lx = lx; u.ly = ly;
        const ha = g.rng() * TAU;
        h.tx = clamp(b.x + Math.cos(ha) * 60, AR.x0 + 15, AR.x1 - 15); h.ty = clamp(b.y + Math.sin(ha) * 50, AR.y0 + 10, AR.y1 - 10);
        g.events.push('climb');
        bark(g, u, '*GRABS FUR*');
      }
      break;
    }
    case 'climb': {
      const dx = SIGIL.x - u.lx, dy = SIGIL.y - u.ly, d = Math.hypot(dx, dy);
      if (d > 1.2) { const s = Math.min(d, 2.8 * dt); u.lx += dx / d * s; u.ly += dy / d * s; }
      else {
        u.atk -= dt;
        if (u.atk <= 0) {
          u.atk = CLASS.rider.rate;
          u.stab = 0.25;
          hurtBoss(g, CLASS.rider.dmg, u);
          text(g, b.x, b.y - 16, `-${CLASS.rider.dmg}`, 'red', 0.9);
          g.shake = Math.max(g.shake, 0.15);
          g.events.push('stab');
        }
      }
      u.grip = Math.min(100, u.grip + 14 * dt);
      const c = Math.cos(b.face), s = Math.sin(b.face);
      u.x = b.x + u.lx * c - u.ly * s; u.y = b.y + u.lx * s + u.ly * c;
      u.walk += dt * 6;
      break;
    }
    case 'flung': {
      u.x += u.vx * dt; u.y += u.vy * dt;
      u.vx *= Math.exp(-5 * dt); u.vy *= Math.exp(-5 * dt);
      clampArena(u);
      u.flungT -= dt;
      if (u.flungT <= 0) { u.state = 'stun'; u.stunT = 2.4; }
      break;
    }
    case 'stun':
      u.moving = false;
      u.stunT -= dt;
      if (u.stunT <= 0) { u.state = 'tohorse'; g.events.push('whistle'); }
      break;
    case 'tohorse': {
      moveTo(u, h.x, h.y, CLASS.rider.spd, dt);
      clampArena(u);
      const ox = h.x, oy = h.y;
      const hd = Math.hypot(u.x - h.x, u.y - h.y);
      if (hd > 2) { h.x += (u.x - h.x) / hd * Math.min(hd, 50 * dt); h.y += (u.y - h.y) / hd * Math.min(hd, 50 * dt); h.face = Math.atan2(h.y - oy, h.x - ox); h.walk += Math.hypot(h.x - ox, h.y - oy); }
      if (hd < 3) { u.mounted = true; u.state = 'orbit'; u.orbitT = 1.5 + g.rng() * 1.5; u.orbitA = Math.atan2(u.y - b.y, u.x - b.x); u.orbitDir = g.rng() < 0.5 ? -1 : 1; g.events.push('neigh'); }
      break;
    }
    case 'leave':
      h.x = u.x; h.y = u.y;
      ride(u.exit.x, u.exit.y, HORSE_SPD);
      if (u.x < V.x - 10 || u.x > V.x + W + 10 || u.y < V.y - 10 || u.y > V.y + H + 10) u.gone = true;
      break;
  }
  // the horse wanders about while he is busy
  if (!u.mounted && u.state !== 'tohorse' && h.tx != null) {
    const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
    if (d > 1) { const s = Math.min(d, 40 * dt); h.x += dx / d * s; h.y += dy / d * s; h.face = Math.atan2(dy, dx); h.walk += s; }
    else if (g.rng() < 0.3 * dt) { h.tx = clamp(h.x + (g.rng() - 0.5) * 30, AR.x0 + 15, AR.x1 - 15); h.ty = clamp(h.y + (g.rng() - 0.5) * 20, AR.y0 + 10, AR.y1 - 10); }
  }
}

function shakeRider(g, u) {
  const b = g.boss;
  u.grip -= 30 + g.rng() * 18;
  if (u.grip > 0) {
    // he slides back down the fur, away from the weak spot
    const dx = u.lx - SIGIL.x, dy = u.ly - SIGIL.y, d = Math.hypot(dx, dy) || 1;
    u.lx = clamp(u.lx + dx / d * 2.5 + (g.rng() - 0.5) * 2, -11, 9);
    u.ly = clamp(u.ly + dy / d * 2.5 + (g.rng() - 0.5) * 2, -8, 8);
    return;
  }
  const c = Math.cos(b.face), s = Math.sin(b.face);
  let wx = u.lx * c - u.ly * s, wy = u.lx * s + u.ly * c;
  const l = Math.hypot(wx, wy);
  if (l < 1) { const a = g.rng() * TAU; wx = Math.cos(a); wy = Math.sin(a); } else { wx /= l; wy /= l; }
  u.state = 'flung'; u.flungT = 0.4;
  u.x = b.x + wx * (b.r + 3); u.y = b.y + wy * (b.r + 3);
  u.vx = wx * 110; u.vy = wy * 110;
  text(g, u.x, u.y - 8, 'SHAKEN OFF', 'cream', 1.2);
  g.events.push('fling');
}

// ---------------------------------------------------------------------------------------------- damage, death

function hurt(g, u, amt) {
  if (!hittable(u)) return;
  if (u.role === 'rider' && u.state === 'stun') amt *= 2;
  u.hp -= amt;
  if (amt > 5) u.hit = 0.12;
  if (u.hp <= 0) kill(g, u);
  else if (!u.party.engaged && amt > 5) engage(g, u.party, 'early');
}

function kill(g, u) {
  u.dead = true;
  const p = u.party;
  const base = u.role === 'pet' ? PTS.pet : PTS[p.type];
  const pts = Math.round(base * g.mult);
  addScore(g, pts);
  g.kills++;
  text(g, u.x, u.y - 6, `+${pts}`, u.role === 'rider' ? 'gold' : 'cream', u.role === 'rider' ? 1.6 : 0.9);
  g.events.push(u.role === 'rider' ? 'riderdie' : 'kill');
  for (let i = 0; i < 7; i++) { const a = g.rng() * TAU, s = 10 + g.rng() * 30; part(g, u.x, u.y - 1, Math.cos(a) * s, Math.sin(a) * s, 0.35, 'blood'); }
  const corpse = { u, x: u.x, y: u.y, cls: u.cls, t: 0 };
  g.corpses.push(corpse);
  if (g.corpses.length > 90) g.corpses.shift();
  if (u.role !== 'pet') g.ghosts.push({ x: u.x, y: u.y - 2, t: 0, vx: (g.rng() - 0.5) * 6 });
  p.deadList.push({ u, x: u.x, y: u.y, t: g.t });
  if (g.boss.taunt?.u === u) g.boss.taunt = null;
  if (p.type !== 'rider' && u.role !== 'pet' && g.rng() < 0.3) bark(g, { x: u.x, y: u.y - 4, dead: true }, pick(g, BARK.died));
  if (u.role === 'rider') {
    const h = u.horse;
    g.ghosts.push({ x: u.x, y: u.y - 2, t: 0, vx: 0 });
    g.parts.push({ horse: true, x: h.x, y: h.y, vx: (h.x < V.x + W / 2 ? -1 : 1) * 70, vy: 0, t: 0, life: 4, face: h.x < V.x + W / 2 ? Math.PI : 0, walk: h.walk });
  }
}

// ---------------------------------------------------------------------------------------------- projectiles and fx

function updateBolts(g, dt) {
  const b = g.boss;
  for (const o of g.bolts) {
    o.t += dt;
    const tgt = o.ally ? o.tgt : o.foe || b;
    if (o.ally ? !hittable(tgt) : o.foe?.dead) { o.done = true; continue; }
    const dx = tgt.x - o.x, dy = tgt.y - o.y, d = Math.hypot(dx, dy);
    const sp = o.kind === 'arrow' ? 150 : o.kind === 'fireball' ? 90 : 100;
    o.vx = dx / (d || 1) * sp; o.vy = dy / (d || 1) * sp;
    o.x += o.vx * dt; o.y += o.vy * dt;
    const hitR = o.ally ? 2 : o.foe ? o.foe.r : b.r - 1;
    if (d < hitR || o.t > 2) {
      o.done = true;
      if (o.ally) { hurt(g, tgt, o.dmg); for (let i = 0; i < 4; i++) part(g, o.x, o.y, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.3, o.kind === 'fireball' ? 'flame' : 'shadow'); }
      else if (o.foe) hurtAdd(g, o.foe, o.dmg);
      else if (!b.dead) {
        hurtBoss(g, o.dmg, o.u);
        for (let i = 0; i < 3; i++) part(g, o.x, o.y, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.25, o.kind);
      }
    }
  }
  g.bolts = g.bolts.filter(o => !o.done);
}

function updateFx(g, dt) {
  for (const p of g.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.horse) { p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt); } else p.walk += Math.abs(p.vx) * dt; }
  g.parts = g.parts.filter(p => p.t < p.life);
  for (const f of g.fires) f.t += dt;
  g.fires = g.fires.filter(f => f.t < f.life);
  for (const i of g.ice) i.t += dt;
  g.ice = g.ice.filter(i => i.t < i.life);
  for (const c of g.corpses) c.t += dt;
  g.corpses = g.corpses.filter(c => c.t < 40);
  for (const o of g.ghosts) { o.t += dt; o.y -= 7 * dt; o.x += o.vx * dt; }
  g.ghosts = g.ghosts.filter(o => o.t < 3.5);
  for (const t of g.texts) t.t += dt;
  g.texts = g.texts.filter(t => t.t < t.life);
  for (const k of g.barks) { k.t += dt; if (k.u && !k.u.dead && !k.u.gone) { k.x = k.u.x; k.y = k.u.y; } }
  g.barks = g.barks.filter(k => k.t < k.life);
  for (const r of g.rings) r.t += dt;
  g.rings = g.rings.filter(r => r.t < (r.col === 'slash' ? 0.18 : 0.45));
  if (g.banner) { g.banner.t += dt; if (g.banner.t > g.banner.dur) g.banner = null; }
}

function separate(g) {
  const us = g.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead || (a.role === 'rider')) continue;
    for (let j = i + 1; j < us.length; j++) {
      const c = us[j];
      if (c.dead || c.role === 'rider') continue;
      const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 9 && d2 > 0.0001) { const d = Math.sqrt(d2), push = (3 - d) * 0.5; a.x -= dx / d * push; a.y -= dy / d * push; c.x += dx / d * push; c.y += dy / d * push; }
    }
    // nobody stands inside the boss, or inside an add
    const b = g.boss, dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = b.r + 2;
    if (d < min && d > 0.001 && !b.dead) { a.x = b.x + dx / d * min; a.y = b.y + dy / d * min; }
    for (const m of g.adds) {
      const ex = a.x - m.x, ey = a.y - m.y, e = Math.hypot(ex, ey), em = m.r + 2;
      if (e < em && e > 0.001) { a.x = m.x + ex / e * em; a.y = m.y + ey / e * em; }
    }
  }
  if (g.props.length || g.water) {
    for (const u of us) if (!u.dead && !(u.role === 'rider' && u.state === 'climb')) P.solidPush(g, u, 2);
    for (const m of g.adds) P.solidPush(g, m, m.r);
  }
  const b = g.boss;
  for (const m of g.adds) {
    const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy), min = b.r + m.r;
    if (d < min && d > 0.001) { m.x = b.x + dx / d * min; m.y = b.y + dy / d * min; }
  }
}

// ---------------------------------------------------------------------------------------------- adds

function pickFoe(g, u) {
  if (u.role === 'healer') return null;
  let best = null, bd = Infinity;
  for (const a of g.adds) {
    if (a.dead) continue;
    const d = Math.hypot(u.x - a.x, u.y - a.y);
    const reach = u.role === 'ranged' ? (u.id % 3 === 0 ? 72 : 0)   // a third of the casters peel off to shoot adds
      : u.role === 'tank' ? 8 : 12;                                // melee swat whatever is biting them
    if (d < reach && d < bd) { best = a; bd = d; }
  }
  return best;
}

function fightAdd(g, u, a, dt) {
  const c = CLASS[u.cls], d = Math.hypot(u.x - a.x, u.y - a.y) || 1;
  if (u.role === 'ranged') {
    if (d > 70) { moveTo(u, a.x, a.y, u.spd, dt); u.cast = 0; }
    else {
      u.moving = false;
      u.cast += dt;
      if (u.cast >= c.rate) { u.cast = 0; g.bolts.push({ x: u.x, y: u.y - 3, dmg: c.dmg * u.party.power, kind: c.bolt, u, foe: a, t: 0 }); }
    }
  } else {
    const ring = a.r + 3;
    moveTo(u, a.x + (u.x - a.x) / d * ring, a.y + (u.y - a.y) / d * ring, u.spd, dt);
    if (d < a.r + 6) {
      u.atk -= dt;
      if (u.atk <= 0) { u.atk = c.rate * (0.85 + g.rng() * 0.3); u.swing = 0.15; hurtAdd(g, a, c.dmg * u.party.power * 1.5); }
    }
  }
  if (Math.abs(a.x - u.x) > 0.5) u.fx = a.x > u.x ? 1 : -1;
  clampArena(u);
  u.swing = Math.max(0, (u.swing || 0) - dt);
}

function hurtAdd(g, a, amt) {
  if (a.dead) return;
  a.hp -= amt;
  a.hit = 0.1;
  if (a.hp > 0) return;
  a.dead = true;
  text(g, a.x, a.y - 8, ADDS[a.kind].name + ' DOWN', 'pink', 1.3);
  for (let i = 0; i < 10; i++) { const k = g.rng() * TAU, s = 15 + g.rng() * 30; part(g, a.x, a.y - 1, Math.cos(k) * s, Math.sin(k) * s, 0.45, a.kind.startsWith('skel') ? 'bone' : 'fur'); }
  g.events.push('adddie');
}

// what Call Adds brings depends on its level: melee, then casters, then a necromancer
function summon(g) {
  const lvl = g.lvl.summon || 0;
  const kinds = lvl === 0 ? ['gnasher', 'gnasher'] : lvl === 1 ? ['spitter', 'spitter'] : ['necro'];
  for (const k of kinds) {
    if (g.adds.filter(a => !a.kind.startsWith('skel')).length >= MAX_ADDS) break;
    spawnAdd(g, k);
  }
  if (lvl === 2) for (let i = 0; i < 2; i++) spawnAdd(g, 'skeleton', g.boss.x + (g.rng() - 0.5) * 30, g.boss.y + (g.rng() - 0.5) * 30);
  g.shake = Math.max(g.shake, 0.2);
}

function spawnAdd(g, kind, x, y) {
  const b = g.boss, D = ADDS[kind];
  if (x == null) {
    if (kind === 'spitter' && g.map.pts) {
      // squats just off the path, somewhere near you (on patrol maps; elsewhere it lands beside you like the rest)
      const p = pathNearest(g.map, b.x + (g.rng() - 0.5) * 50, b.y + (g.rng() - 0.5) * 50), side = g.rng() < 0.5 ? -1 : 1;
      const q = pathNearest(g.map, p.x + 3, p.y), ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      x = p.x + Math.cos(ang) * side * (LANE + 5); y = p.y + Math.sin(ang) * side * (LANE + 5);
    } else {
      const k = b.face + Math.PI + (g.rng() - 0.5) * 1.5;
      x = b.x + Math.cos(k) * (b.r + D.r + 3); y = b.y + Math.sin(k) * (b.r + D.r + 3);
    }
  }
  const a = { id: g.nextId++, kind, x: clamp(x, AR.x0, AR.x1), y: clamp(y, AR.y0, AR.y1), hp: D.hp, maxhp: D.hp, r: D.r,
    atk: 0.5, walk: 0, moving: false, fx: 1, hit: 0, t: 0, swing: 0, slot: g.rng() * TAU, raise: 2 };
  g.adds.push(a);
  g.summoned++;
  text(g, a.x, a.y - 9, kind.startsWith('skel') ? 'RISE' : D.name + '!', kind.startsWith('skel') ? 'heal' : 'gold', 1.4);
  for (let i = 0; i < 12; i++) { const k = g.rng() * TAU, s = 20 + g.rng() * 25; part(g, a.x, a.y, Math.cos(k) * s, Math.sin(k) * s, 0.5, kind.startsWith('skel') || kind === 'necro' ? 'heal' : 'dust'); }
  g.events.push(kind.startsWith('skel') ? 'rise' : 'summon');
  return a;
}

function updateAdd(g, a, dt) {
  const b = g.boss, D = ADDS[a.kind];
  a.t += dt; a.hit = Math.max(0, a.hit - dt); a.atk -= dt; a.swing = Math.max(0, a.swing - dt);
  if (b.dead) { a.moving = false; return; }
  let tgt = null, td = Infinity;
  for (const u of g.units) {
    if (!hittable(u) || u.state === 'flee') continue;
    const d = Math.hypot(u.x - a.x, u.y - a.y);
    if (d < D.sense && d < td) { tgt = u; td = d; }
  }
  if (a.kind === 'necro') {
    // raises the nearest fallen hero as a skeleton, now and then
    a.raise -= dt;
    if (a.raise <= 0 && g.adds.filter(m => m.kind.startsWith('skel')).length < MAX_SKELETONS) {
      const raises = c => c.critter ? P.CRITTERS[c.critter].raise : c.cls !== 'pet' && 'skeleton';
      const c = g.corpses.filter(c => raises(c) && Math.hypot(c.x - a.x, c.y - a.y) < 90).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
      if (c) {
        g.corpses.splice(g.corpses.indexOf(c), 1);
        if (c.u) { const dl = c.u.party.deadList.findIndex(e => e.u === c.u); if (dl >= 0) c.u.party.deadList.splice(dl, 1); }
        spawnAdd(g, raises(c), c.x, c.y);
        a.swing = 0.4;
        a.raise = 3.2;
      } else a.raise = 0.5;
    }
  }
  if (a.kind === 'spitter' || a.kind === 'necro') {
    if (tgt) {
      a.fx = tgt.x > a.x ? 1 : -1;
      if (a.atk <= 0) {
        a.atk = D.rate; a.swing = Math.max(a.swing, 0.25);
        g.bolts.push({ x: a.x, y: a.y - 3, dmg: D.dmg, kind: a.kind === 'spitter' ? 'fireball' : 'shadow', ally: true, tgt, t: 0 });
        g.events.push('spit');
      }
    }
    if (a.kind === 'spitter') { a.moving = false; return; }
    // the necromancer keeps to your side
    const k = b.face + Math.PI * 0.75 * (Math.sin(a.slot) > 0 ? 1 : -1), dist = b.r + 12;
    if (moveTo(a, b.x + Math.cos(k) * dist, b.y + Math.sin(k) * dist, D.spd, dt)) a.moving = false;
    clampArena(a);
    return;
  }
  // gnashers and skeletons never stray too far from you
  if (Math.hypot(a.x - b.x, a.y - b.y) > 95) tgt = null;
  if (tgt) {
    const reach = a.r + D.reach;
    if (td > reach - 1) moveTo(a, tgt.x, tgt.y, D.spd, dt); else a.moving = false;
    if (td < reach + 1 && a.atk <= 0) {
      a.atk = D.rate * (0.85 + g.rng() * 0.3);
      a.swing = 0.2;
      hurt(g, tgt, D.dmg);
      g.events.push('bite');
    }
  } else {
    // heel: trail along beside the boss
    const k = b.face + Math.PI + Math.sin(a.slot) * 1.3, dist = b.r + a.r + 6;
    if (moveTo(a, b.x + Math.cos(k) * dist, b.y + Math.sin(k) * dist, D.spd * 1.1, dt)) a.moving = false;
  }
  clampArena(a);
}

// ---------------------------------------------------------------------------------------------- the store

export const maxLevel = id => id === 'summon' ? 2 : 3;

// this run's ability numbers, with every upgrade applied
export function applyLevels(g) {
  const L = k => g.lvl[k] || 0, a = JSON.parse(JSON.stringify(ABIL));
  a.swipe.dmg *= 1 + 0.3 * L('swipe'); a.swipe.range += 3 * L('swipe');
  a.stomp.dmg *= 1 + 0.3 * L('stomp'); a.stomp.range *= 1 + 0.12 * L('stomp');
  a.breath.dps *= 1 + 0.3 * L('breath'); a.breath.dmg *= 1 + 0.3 * L('breath'); a.breath.range *= 1 + 0.15 * L('breath');
  a.roar.range *= 1 + 0.15 * L('roar'); a.roar.fear += 0.6 * L('roar');
  a.tail.dmg *= 1 + 0.3 * L('tail'); a.tail.range += 3 * L('tail');
  a.beam.dps *= 1 + 0.35 * L('beam'); a.beam.range *= 1 + 0.2 * L('beam');
  a.ice.range *= 1 + 0.25 * L('ice'); a.ice.life += 2 * L('ice');
  a.charge.dmg *= 1 + 0.3 * L('charge'); a.charge.range *= 1 + 0.2 * L('charge'); a.charge.stun += 0.5 * L('charge');
  a.haste.time += 1.5 * L('haste'); a.haste.boost += 0.2 * L('haste');
  g.abil = a;
  const b = g.boss, old = b.maxhp;
  b.maxhp = BOSS_HP * (1 + 0.25 * L('fur'));
  b.hp = Math.max(1, b.hp + b.maxhp - old);
}

// what the store shows for one catalogue entry
export function abilityOffer(g, id) {
  const it = ABILITIES.find(a => a.id === id), lvl = g.lvl[id] || 0, max = maxLevel(id);
  if (it.passive) {
    const cost = lvl < max ? [it.cost, ...UP_COST.slice(1)][lvl] : null;
    return { it, owned: lvl > 0, lvl, max, buyCost: null, upCost: cost, upText: it.up };
  }
  const owned = g.owned.has(id);
  const upCost = owned && lvl < max ? (it.upCost || UP_COST)[lvl] : null;
  const upText = it.ups ? it.ups[lvl] : it.up;
  return { it, owned, lvl, max, buyCost: owned ? null : it.cost, upCost, upText };
}

export function spend(g, n) {
  if (g.points < n) return false;
  g.points -= n; g.spent += n;
  return true;
}

export function buyAbility(g, id) {
  const o = abilityOffer(g, id);
  if (o.buyCost == null || !spend(g, o.buyCost)) return false;
  g.owned.add(id);
  const free = g.slots.indexOf(null);
  if (free >= 0) g.slots[free] = id;
  return true;
}

export function upgradeAbility(g, id) {
  const o = abilityOffer(g, id);
  if (o.upCost == null || !spend(g, o.upCost)) return false;
  g.lvl[id] = (g.lvl[id] || 0) + 1;
  applyLevels(g);
  return true;
}

// puts an owned ability in slot i; if it was already in another slot, the two swap
export function setSlot(g, i, id) {
  if (id && !g.owned.has(id)) return;
  const j = id ? g.slots.indexOf(id) : -1;
  if (j >= 0) g.slots[j] = g.slots[i];
  g.slots[i] = id || null;
}

// ---------------------------------------------------------------------------------------------- the store's demo reel

// A little world for the store's preview screen: the boss on the first map, nothing spawning, a 5-man walking into
// whatever ability is on show, cast on a loop. demoSet picks the ability and its level; demoStep runs it.
const DEMO_AT = { x: 110, y: 96 };
export function createDemo(look) {
  const d = createGame(7, look);
  d.dir.final = true;   // the director stays home
  // a plain field: no path, and the rocks are somewhere else entirely
  Object.assign(d.map, { plain: true, A: { x: -400, y: -400 }, B: { x: -300, y: -400 } });
  d.demo = { id: 'swipe', t: 0, cycle: 0 };
  return d;
}

export function demoSet(d, id, lvl, look) {
  for (const k of ['units', 'parties', 'corpses', 'ghosts', 'fires', 'ice', 'bolts', 'parts', 'texts', 'barks', 'rings', 'adds', 'ashes']) d[k] = [];
  const it = ABILITIES.find(a => a.id === id);
  d.owned = new Set([id, 'swipe']); d.lvl = { [id]: lvl };
  d.slots = [it.passive ? 'swipe' : id, null, null, null, null];
  if (look) d.look = { ...look };
  const b = d.boss;
  b.hp = b.maxhp;
  applyLevels(d);
  Object.assign(b, { x: DEMO_AT.x, y: DEMO_AT.y, face: 0, act: null, queue: null, haste: 0, taunt: null, evade: null, dead: false, hp: b.maxhp });
  for (const k in b.cd) b.cd[k] = 0;
  d.demo = { id, t: 0, cycle: 0 };
  d.banner = null; d.thought = null;
  demoParty(d);
}

function demoParty(d) {
  const p = newParty(d, 'dungeon');
  p.power = 0.6;
  const tail = d.demo.id === 'tail';
  const comp = ['warrior', 'priest', 'rogue', 'mage', 'hunter'];
  comp.forEach((cls, i) => {
    const x = tail ? 30 + i * 6 : 200 + i * 7, y = DEMO_AT.y - 14 + i * 7;
    const u = mkUnit(d, p, cls, x, y);
    u.slotA = u.role === 'melee' ? (d.rng() - 0.5) * 1.2 : Math.PI + (d.rng() - 0.5) * 1.2;
    u.slotD = u.role === 'healer' ? 50 : u.role === 'ranged' ? 42 : 2;
    u.home = { x, y };
  });
}

export function demoStep(d, dt) {
  const dm = d.demo, b = d.boss, id = dm.id;
  dm.t += dt;
  const live = d.units.filter(u => !u.dead && !u.gone);
  // a fresh party once this one is dead or scared off screen
  if (!live.length || live.every(u => u.x < -20 || u.x > W + 20 || u.y < -20 || u.y > H + 20)) {
    if ((dm.gap = (dm.gap || 0) + dt) > 1.2) { dm.gap = 0; d.units = []; d.parties = []; demoParty(d); }
  }
  // the boss cannot lose in the shop
  b.hp = b.maxhp; b.dead = false; b.evade = null;
  const near = live.reduce((a, u) => !a || Math.hypot(u.x - b.x, u.y - b.y) < Math.hypot(a.x - b.x, a.y - b.y) ? u : a, null);
  const aim = near ? { x: near.x, y: near.y } : { x: b.x + 40, y: b.y };
  const inp = { mx: aim.x, my: aim.y, ax: 0, ay: 0, press: {}, hold: {} };
  const dist = near ? Math.hypot(near.x - b.x, near.y - b.y) : 999;
  const it = ABILITIES.find(a => a.id === id);
  if (id === 'tail') { inp.mx = b.x + (b.x - aim.x); inp.my = b.y + (b.y - aim.y); }
  if (id === 'haste') {
    // zoomies: run laps of the clearing
    const k = Math.floor(dm.t / 1.6) % 2 ? -1 : 1;
    inp.ax = k; inp.mx = b.x + k * 30; inp.my = b.y;
    if (b.haste <= 0 && !b.act) { b.cd.haste = 0; inp.press.slot0 = true; }
    if (Math.hypot(b.x - DEMO_AT.x, b.y - DEMO_AT.y) > 70) { inp.ax = Math.sign(DEMO_AT.x - b.x); }
  } else if (id === 'swipe' || it.passive) {
    if (dist < 34) inp.hold.slot0 = true;
  } else {
    // everything else goes off once the party is close enough to be worth it, then again after a short breather
    const ready = !b.act && dm.t - (dm.last || -9) > 3.2;
    const range = { stomp: 34, roar: 70, breath: 60, beam: 160, ice: 44, charge: 60, summon: 200, tail: 30 }[id] || 40;
    if (ready && dist < range) { b.cd[id] = 0; inp.press.slot0 = true; dm.last = dm.t; }
  }
  // the boss wanders back to its mark between casts (charge brings itself back)
  if (!b.act && id !== 'haste' && Math.hypot(b.x - DEMO_AT.x, b.y - DEMO_AT.y) > 6) {
    inp.ax = clamp((DEMO_AT.x - b.x) / 20, -1, 1); inp.ay = clamp((DEMO_AT.y - b.y) / 20, -1, 1);
  }
  step(d, inp, dt);
  if (d.adds.length > 4) d.adds.splice(0, d.adds.length - 4);
  d.events.length = 0; d.banner = null; d.thought = null; d.clear = null; d.store = false;
}

function part(g, x, y, vx, vy, life, kind) { if (g.parts.length < 400) g.parts.push({ x, y, vx, vy, t: 0, life, kind }); }
function text(g, x, y, s, col, life = 1.1) { g.texts.push({ x, y, s, col, t: 0, life }); }
function bark(g, u, s) {
  g.barks = g.barks.filter(k => k.u !== u);
  if (g.barks.length >= 6) g.barks.shift();
  g.barks.push({ u: u.dead ? null : u, x: u.x, y: u.y, s, t: 0, life: 2 });
}
function banner(g, s, sub, dur = 3.2) { g.banner = { s, sub, t: 0, dur }; }

// New Game+: a fresh run from level 1 with every ability, upgrade and slot from the run you won, and tougher heroes.
export function newGamePlus(prev, look) {
  const g = createGame(undefined, look);
  g.ng = (prev.ng || 0) + 1;
  g.owned = new Set(prev.owned);
  g.lvl = { ...prev.lvl };
  g.slots = [...prev.slots];
  applyLevels(g);
  g.boss.hp = g.boss.maxhp;
  return g;
}

// The ending: back in the clearing, the boss comes home to its rocks. A tiny script drives the ordinary sim (nobody
// spawns, nothing scores); the page adds the captions and hearts. endingStep returns false once it is over.
export const ENDING_LINES = [
  [0, 'THE KINGDOM IS RUBBLE.'],
  [2.8, 'THE HEROES HAVE ALL LOGGED OFF.'],
  [5.6, 'AND AT LAST, THE LONG WALK HOME.'],
];
export function createEnding(look) {
  const e = createGame(11, look);
  e.dir.final = true;
  const { A, B } = e.map;
  Object.assign(e.boss, { x: W - 8, y: H - 26, face: Math.PI * 1.2 });
  e.lastMark = 'A';   // walking to B first
  e.end = { wp: [{ x: W - 70, y: H - 46 }, { x: B.x + 40, y: B.y + 22 }], t: 0, phase: 'walk', caption: ENDING_LINES[0][1], capT: 0, hearts: [], at: null, done: false };
  return e;
}
export function endingStep(e, dt) {
  const en = e.end, b = e.boss, { A, B } = e.map;
  en.t += dt; en.capT += dt;
  const say = s => { if (en.caption !== s) { en.caption = s; en.capT = 0; } };
  const heart = n => { for (let i = 0; i < n; i++) en.hearts.push({ x: b.x + (e.rng() - 0.5) * 18, y: b.y - 8 - e.rng() * 6, vx: (e.rng() - 0.5) * 8, t: -i * 0.18 }); };
  for (const h of en.hearts) { h.t += dt; if (h.t > 0) { h.y -= 9 * dt; h.x += h.vx * dt; } }
  en.hearts = en.hearts.filter(h => h.t < 2.4);
  if (en.phase === 'walk') for (const [t, s] of ENDING_LINES) if (en.t >= t) say(s);

  const inp = { mx: b.x - 30, my: b.y, ax: 0, ay: 0, press: {}, hold: {} };
  const go = (p, side, pace = 1) => {
    const tx = p.x + side * 15, ty = p.y + 3, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d < 2) return true;
    inp.ax = dx / Math.max(d, 8) * pace; inp.ay = dy / Math.max(d, 8) * pace;
    inp.mx = b.x + dx; inp.my = b.y + dy;
    return false;
  };
  const look = p => { inp.mx = p.x; inp.my = p.y; };
  if (en.phase === 'walk') {
    // a tired amble in from the corner, the long way round
    if (en.wp.length) { if (go(en.wp[0], 0, 0.55)) en.wp.shift(); }
    else if (go(B, 1, 0.7)) { en.phase = 'other'; en.at = en.t; e.lastMark = 'B'; say('OTHER ROCK!'); heart(6); inp.press.shake = true; e.events.push('buy'); }
  } else if (en.phase === 'other') {
    look(B);
    if (en.t - en.at > 2.6) { en.phase = 'cross'; say('NOW, WHERE IS...'); }
  } else if (en.phase === 'cross') {
    b.haste = 0.5;   // zoomies, obviously
    if (go(A, -1)) { b.haste = 0; en.phase = 'rock'; en.at = en.t; e.lastMark = 'A'; say('ROCK!!'); heart(9); inp.press.shake = true; e.events.push('buy'); }
  } else if (en.phase === 'rock') {
    look(A);
    if (en.t - en.at > 2.6) { en.phase = 'home'; en.at = en.t; say('TOGETHER AGAIN. AS IT SHOULD BE.'); }
  } else if (en.phase === 'home') {
    // settles between them, facing out over the clearing, and pats each rock with a heart now and then
    const mid = { x: (A.x + B.x) / 2, y: A.y + 14 };
    const dx = mid.x - b.x, dy = mid.y - b.y, d = Math.hypot(dx, dy);
    if (d > 2) { inp.ax = dx / Math.max(d, 8); inp.ay = dy / Math.max(d, 8); inp.mx = b.x + dx; inp.my = b.y + dy; }
    else { inp.mx = b.x; inp.my = b.y + 30; }
    if (Math.floor((en.t - en.at) / 1.4) !== Math.floor((en.t - en.at - dt) / 1.4)) heart(2);
    if (en.t - en.at > 5.5) { say('THE END. (CLOCK IN AGAIN?)'); }
    if (en.t - en.at > 8.5) en.done = true;
  }
  step(e, inp, dt);
  b.hp = b.maxhp;
  e.texts.length = 0; e.thought = null; e.banner = null; e.barks.length = 0;
  return !en.done;
}
