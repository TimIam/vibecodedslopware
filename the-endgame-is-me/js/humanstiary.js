// The Humanstiary: the Handbook's field guide to everything that is not the boss. Two pages, built from the live
// tables every time it opens (CLASS and the party skills in world.js, the critters the levels registered in props.js),
// so a new class or animal turns up here by itself, with a stock description until somebody writes it a better one.
// Portraits are the game's own sprites, drawn alone and blown up.

import { CLASS, ROCK_R, TOUCH, createGame, newParty, mkUnit } from './world.js';
import { CRITTERS } from './props.js';
import { drawThing } from './render.js';
import { PAL, newCanvas } from './art.js';

const $ = id => document.getElementById(id);
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const pct = v => Math.round(v * 100) + '%';

// ------------------------------------------------------------------------------------------------ one thing, alone

// Draws something by itself on a scratch canvas with (x, y) at a known spot, and finds what it covered. `solid` is the
// alpha a pixel needs to count (shadows are fainter than 128, so 128 leaves them out).
const scratches = new Map();
export function isolate(x, y, draw, { hx = 32, up = 44, down = 20, solid = 1 } = {}) {
  const w = hx * 2, h = up + down, key = w + 'x' + h;
  let cv = scratches.get(key);
  if (!cv) { cv = newCanvas(w, h); scratches.set(key, cv); }
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);
  c.translate(hx - Math.round(x), up - Math.round(y));
  try { draw(c); } catch (e) { console.warn('could not draw that:', e.message); }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  const d = c.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (d[(py * w + px) * 4 + 3] < solid) continue;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  return { cv, d, w, h, hx, up, empty: x1 < 0, x0, y0, x1, y1 };
}

// paints an isolated thing into a picture frame, as big as whole-number scaling allows
export function portrait(cv, iso, bg = PAL.grass1) {
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  if (iso.empty) return;
  const bw = iso.x1 - iso.x0 + 1, bh = iso.y1 - iso.y0 + 1;
  const s = Math.max(1, Math.min(8, Math.floor((cv.width - 8) / bw), Math.floor((cv.height - 8) / bh)));
  c.drawImage(iso.cv, iso.x0, iso.y0, bw, bh, Math.round((cv.width - bw * s) / 2), Math.round((cv.height - bh * s) / 2), bw * s, bh * s);
}

// ------------------------------------------------------------------------------------------------ what the boss thinks

const ROLE = { tank: 'Tank', healer: 'Healer', melee: 'Melee', ranged: 'Ranged', pet: 'Pet', rider: 'Horse guy', king: 'Royalty' };
const HERO = {
  warrior: ['Taunt: makes you look at him. Shield. Stands in front.',
    'Stands at your face and shouts until you look at him. You look at him. Everyone else hides behind this and calls it a strategy.'],
  priest: ['Heals whoever is closest to dying. Glows while doing it.',
    'Undoes your work from a safe distance. Eat this one first. They will type HEALS?? either way.'],
  druid: ['Heals too: a little less, a little more often.',
    'A priest that smells of leaves. Says it could be a bear if it wanted. Has never once been a bear.'],
  rogue: ['Stabs you in the back, quickly.',
    'Stands behind you because the guide said so. Believes it is top of a meter you cannot see.'],
  berserker: ['Hits you in the back, slower and harder.',
    'Two axes and no plan. Dies in the fire, then asks where the heals were.'],
  paladin: ['Hits you in the back. Chewy.',
    'Pink, shiny and harder to bite through than the rest. Has a bubble it is saving for later. Later never comes.'],
  mage: ['Frost bolts from a long way off.',
    'Throws cold things from the back and made everyone wait while it drank. Folds like paper once you get there.'],
  warlock: ['Shadow bolts from a long way off.',
    'A mage, but purple and pleased about it. Keeps offering the others a green rock. You have two rocks. Yours are better.'],
  hunter: ['Arrows from range. Brings a pet, and the pet pulls.',
    'Shoots arrows and apologises for the pet. The pet is why the fight started. The pet has never apologised.'],
  rider: ['Rides in, gets off, climbs your fur and stabs the glowing spot on your back. Shake him off, then step on him.',
    'A quiet man on a horse. Does not bark, does not dance, has not read the guide. He has done this to bigger things than you.'],
  king: ['None. Hides behind forty people.',
    'Gold armour. Very shiny. Very thin. Pays people to stand in front of him, and it shows.'],
};
const ROLE_ABIL = {
  tank: 'Taunts, and stands in front.', healer: 'Heals whoever is closest to dying.', melee: 'Hits you from behind.',
  ranged: 'Throws things from a long way off.', pet: 'Bites. Pulls early.', rider: 'Climbs you.', king: 'None to speak of.',
};
const STOCK_HERO = 'New around here. Nobody has told the boss what this one is for. It will find out by stepping on it.';

const PETS = {
  pet: ['The hunter\'s pet', 'Runs in ahead of everybody and bites you, which is how most fights start. Nobody ever turns Growl off.'],
  voidwalker: ['Voidwalker', 'A blue lump of nothing the warlock keeps on a lead. Stands next to you and soaks it all up. Does not seem to mind.'],
  imp: ['Imp', 'Small, orange, throws fire and opinions. The warlock says it is under control. It is not under control.'],
};
const isPet = c => c.pet || c.role === 'pet';
const STOCK_PET ='Somebody\'s pet. It bites, it pulls early, and its owner says sorry in chat.';

const CRITTER = {
  villager: ['Villager', 'Runs in circles waving its arms. No guild, no guide, no chance. A necromancer can get more work out of it afterwards.'],
  city_folk: ['Townsfolk', 'Villagers with better hats and the same plan, which is to run.'],
  cart: ['Horse and cart', 'A horse with somebody\'s whole harvest behind it. Bolts for the edge of the map the moment it sees you. Catch it and the cart stays.'],
  horse: ['Loose horse', 'A horse with no cart and no quiet man. Has seen what happens to the ones with carts. Leaves.'],
  cow: ['Cow', 'Stands in a field being a cow until you arrive. Can be stood back up afterwards, bones only, which nobody asked for.'],
  pig: ['Pig', 'Round, loud, and slower than it thinks.'],
  chicken: ['Chicken', 'Small, fast and worth less than the effort. You will chase it anyway.'],
};
const STOCK_CRITTER = 'Lives here. Would rather you did not.';

// ------------------------------------------------------------------------------------------------ the pages

let lab = null;   // a spare game to stand the specimens in; never stepped, never saved
function specimenGame() {
  if (!lab) { lab = createGame(7); lab.boss.x = 9000; lab.boss.y = 9000; }
  lab.units.length = 0; lab.parties.length = 0;
  return lab;
}
const AT = { x: 100, y: 100 };

function heroStats(c) {
  const bits = [`HP ${c.hp}`, `speed ${c.spd}`];
  if (c.dmg) bits.push(`hits for ${c.dmg} every ${c.rate} s`);
  if (c.heal) bits.push(`heals ${c.heal} every ${c.rate} s`);
  if (c.bolt) bits.push(`${c.bolt} bolts`);
  return bits.join(' · ');
}

function unitShot(g, cls) {
  const p = newParty(g, cls === 'rider' ? 'rider' : 'dungeon');
  const u = mkUnit(g, p, cls, AT.x, AT.y);
  if (cls === 'rider') {
    Object.assign(u, { state: 'arrive', mounted: true, grip: 100, hface: 0, horse: { x: AT.x, y: AT.y, face: 0, walk: 0 } });
    return isolate(AT.x, AT.y, c => drawThing.rider(c, u, g));
  }
  return isolate(AT.x, AT.y, c => drawThing.unit(c, u, g));
}

function heroes() {
  const g = specimenGame();
  const out = [];
  for (const [cls, c] of Object.entries(CLASS)) {
    if (isPet(c)) continue;
    const [abil, desc] = HERO[cls] || [ROLE_ABIL[c.role] || 'Unknown.', STOCK_HERO];
    out.push({ name: cls === 'rider' ? 'The quiet man' : cls === 'king' ? 'The king' : title(cls), tag: ROLE[c.role] || title(c.role), abil, stats: heroStats(c), desc, shot: () => unitShot(g, cls) });
  }
  return out;
}

// how sharp each kind of group is, straight from the table the heroes use
function habits() {
  const g = specimenGame();
  const rows = [['dungeon', '5-man'], ['raid', 'Raid'], ['rider', 'The quiet man']].map(([type, name]) => {
    const s = newParty(g, type).skill;
    return s ? `<dt>${name}</dt><dd>sees it coming in ${s.react} s · dodges ${pct(s.dodge)} · ${s.fire ? pct(s.fire) + ' think the fire is fine' : 'never stands in fire'}</dd>` : '';
  }).join('');
  g.parties.length = 0;
  return `<dl class="humHabits">${rows}</dl><p class="note">Numbers are before gear. Every group that turns up is a little better dressed than the last.</p>`;
}

function critterShot(g, kind) {
  const d = CRITTERS[kind];
  const c = { id: 1, kind, x: AT.x, y: AT.y, hx: AT.x, hy: AT.y, hp: d.hp, r: d.r, dead: false, gone: false, walk: 0, fx: 1, moving: false,
    tx: AT.x, ty: AT.y, scared: 0, hitT: 0, seed: 1, face: 0 };
  return isolate(AT.x, AT.y, x => drawThing.critter(x, c, g));
}

function others() {
  const g = specimenGame();
  const out = [];
  const add = kind => {
    const d = CRITTERS[kind];
    if (!d) return;
    const [name, desc] = CRITTER[kind] || [title(kind), STOCK_CRITTER];
    out.push({ name, tag: d.leaves ? 'Leaves if it can' : 'Bystander', abil: d.raise ? 'Runs away. Can be raised from the dead.' : 'Runs away.',
      stats: `HP ${d.hp} · speed ${d.spd}, ${d.flee} when it has seen you · worth ${d.value.pts} points`, desc, shot: () => critterShot(g, kind) });
  };
  add('villager');
  const horse = { x: AT.x, y: AT.y, face: 0, walk: 0 };
  out.push({ name: 'The quiet man\'s horse', tag: 'Accomplice', abil: 'Carries him in. Waits. Carries him out again if there is anything left to carry.',
    stats: 'No health bar. Faster than you. Cannot be stepped on, and you have tried.',
    desc: 'It did not help. It would like it noted that it did not help.', shot: () => isolate(AT.x, AT.y, c => drawThing.horse(c, horse, g)) });
  for (const k of ['cart', 'horse', 'pig', 'chicken']) add(k);
  for (const k of Object.keys(CRITTERS)) if (!['villager', 'cart', 'horse', 'pig', 'chicken'].includes(k)) add(k);
  for (const [cls, c] of Object.entries(CLASS)) {
    if (!isPet(c)) continue;
    const [name, desc] = PETS[cls] || [title(cls), STOCK_PET];
    out.push({ name, tag: 'Pet', abil: c.bolt ? `Throws ${c.bolt}s from behind its owner.` : 'Bites. Goes in before anyone said go.', stats: heroStats(c), desc, shot: () => unitShot(g, cls) });
  }
  const rock = other => () => isolate(AT.x, AT.y, c => drawThing.rock(c, AT.x, AT.y, other));
  out.push({ name: 'The Rock', tag: 'Rock', abil: 'Being at one end of the path.',
    stats: `Solid, ${ROCK_R * 2} across. Come within ${TOUCH} and it counts as a visit. Cannot be hurt, moved or reasoned with.`,
    desc: 'One end of the path. Has never once interrupted you.', shot: rock(false) });
  out.push({ name: 'The Other Rock', tag: 'Rock', abil: 'Being at the other end of the path.',
    stats: `Solid, ${ROCK_R * 2} across. Come within ${TOUCH} and it counts as a visit. Mossier.`,
    desc: 'The other end of the path. You like them both the same. You like this one slightly more.', shot: rock(true) });
  return out;
}

const PAGES = [
  { name: 'Heroes', lead: 'The ones who come to you. They met an hour ago, or they read the guide, or they brought a horse.', list: heroes, extra: habits },
  { name: 'Everyone else', lead: 'Not here for you. In the way all the same.', list: others },
];

export function createHumanstiary() {
  const body = $('humBody'), tabs = [...document.querySelectorAll('#humTabs button')];
  let at = 0;

  function show(n) {
    at = n;
    tabs.forEach((t, i) => t.setAttribute('aria-selected', i === n));
    const page = PAGES[n];
    let list = [];
    try { list = page.list(); } catch (e) { console.warn('humanstiary:', e.message); }
    body.innerHTML = `<p class="humLead">${page.lead}</p>` + (page.extra ? page.extra() : '') + '<div class="humList">' + list.map(e =>
      `<div class="hum"><canvas width="72" height="72" aria-hidden="true"></canvas><div><b class="nm">${e.name}</b><span class="tag">${e.tag}</span>` +
      `<span class="abil">${e.abil}</span><span class="stat">${e.stats}</span><span class="desc">${e.desc}</span></div></div>`).join('') + '</div>';
    // the scratch canvas is shared, so each portrait is drawn just before it is copied out
    const frames = body.querySelectorAll('.hum canvas');
    list.forEach((e, i) => portrait(frames[i], e.shot()));
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('focus', () => { if (at !== i) show(i); });
  });

  return { open(n = 0) { show(n); }, get page() { return at; }, tab: () => tabs[at] };
}
