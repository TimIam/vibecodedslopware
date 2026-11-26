// The Humanstiary: the Handbook's field guide to everything that is not the boss: heroes, everyone else, plants and
// buildings. Built from the live tables every time it opens (CLASS and the party skills in world.js, the critters and
// props the levels registered in props.js), so a new class or animal turns up here by itself, with a stock
// description until somebody writes it a better one. The secret level's creatures stay out of it. No scroll bar: the
// entries are laid out in pages that fit the screen, turned with Prev and Next. Portraits are the game's own sprites,
// drawn alone and blown up (or shrunk, for the big buildings). Under each portrait of something that can die or fall
// down: how many of it the boss has killed or wrecked, over every run (tally.js; an entry's `n` is its key there).

import { CLASS, ROCK_R, TOUCH, createGame, newParty, mkUnit, jumpToLevel } from './world.js';
import { CRITTERS, KINDS, addProp } from './props.js';
import { drawThing, createRenderer } from './render.js';
import { PAL, newCanvas } from './art.js';
import { count } from './tally.js';

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
  // whole-number scaling when it fits; something bigger than the frame (a castle tower) is shrunk to fit instead
  const fit = Math.min((cv.width - 8) / bw, (cv.height - 8) / bh);
  const s = fit >= 1 ? Math.min(8, Math.floor(fit)) : fit;
  const dw = Math.round(bw * s), dh = Math.round(bh * s);
  c.imageSmoothingEnabled = s < 1;
  c.drawImage(iso.cv, iso.x0, iso.y0, bw, bh, Math.round((cv.width - dw) / 2), Math.round((cv.height - dh) / 2), dw, dh);
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
  rat: ['Rat', 'Lives in the walls of the city and the castle, and has outlived every king so far. Black or brown, smaller than a hen, and gone before you have turned round.'],
};
const STOCK_CRITTER = 'Lives here. Would rather you did not.';
// the secret level's lot: not in the book, so as not to give it away
const SECRET = new Set(['evil_cow', 'fen_steer', 'fen_mino']);

// [common name, scientific name, where, what the boss knows about it]
const PLANT = {
  pine: ['Shrugging Pine', 'Pinus indifferens', 'The Low Wood', 'Grows tall, straight and unbothered, a lot like you. Goes over with one good shove and burns like it was waiting for the chance.'],
  oak: ['Grudge Oak', 'Quercus rancorosa', 'The Low Wood', 'Takes three hundred years to grow and three seconds to knock flat, and remembers every one of the three hundred.'],
  bush: ['Common Ankle-Bush', 'Rubus tripwirensis', 'The Low Wood', 'Exists to be walked through. Adventurers hide behind it. It does not hide them.'],
  wheat: ['Bread-in-Waiting', 'Triticum patiens', 'The Farms', 'Rows of it, all the same height, all facing the same way. Somebody was going to make this into bread.'],
  cabbage: ['Stoic Cabbage', 'Brassica stoica', 'The Farms', 'Sits in the mud and takes it. The only thing on the farm that does not run from you, mainly for want of legs.'],
  hay: ['Retired Grass', 'Graminea emerita', 'The Farms', 'Grass that has finished growing and been rolled up for the winter. Still technically a plant. Burns very well.'],
};
const STOCK_PLANT = ['Unknown plant', 'Planta incognita', 'the wild', 'Green, mostly. It was here first.'];

// [name, where, why it is there at all]
const BUILDING = {
  fence: ['Field fence', 'The Farms', 'Put up to keep the cows in. Nobody asked it to keep anything out, which is lucky for it.'],
  hut: ["Farmhand's hut", 'The Farms', 'The farmhand sleeps here because the barn is for the cows, and the cows were there first.'],
  barn: ['Barn', 'The Farms', 'Built to keep the rain off the hay. Mostly hay inside, which is why it goes up so fast.'],
  cottage: ['Cottage', 'The Villages', "Somebody's grandad built it. Nobody has had the heart to knock it down. You do not have that problem."],
  inn: ['Village inn', 'The Villages', 'There so that every adventure can start with "meet at the inn". This is where they planned you.'],
  well: ['Well', 'The Villages', 'The village was built around it, which is why the village is round.'],
  stall: ['Market stall', 'The Villages', 'Sells cabbages to people who grow cabbages. Nobody has worked out who profits.'],
  wl_cottage: ['Outskirts cottage', 'The City Wall', 'Built outside the wall because the rent inside is ruinous. The landlord inside is the king.'],
  wl_house: ['Outskirts house', 'The City Wall', 'Two storeys, outside the wall, and very proud of the second one. Shoved into the moat it makes a fine bridge.'],
  wl_barn: ['Outskirts barn', 'The City Wall', "Keeps the city's hay outside the city, in case of exactly this."],
  wl_watch: ['Watchtower', 'The City Wall', 'Exists so somebody can see you coming and do nothing about it a little sooner.'],
  wl_curtain: ['The City Wall', 'The City Wall', 'Built to keep things like you out. Shoots back. Pulling the bridge up was the whole plan.'],
  wl_tower: ['Wall tower', 'The City Wall', 'A wall that wanted to be taller. Fires ballista bolts slowly, which is still too often.'],
  wl_gate: ['Gatehouse', 'The City Wall', 'Where the drawbridge lives. The drawbridge is up, and it is not coming down for you.'],
  city_house: ['Townhouse', 'Inside the Walls', "Somewhere for the city's taxpayers to keep their things. The things are in the street now."],
  city_chapel: ['Chapel', 'Inside the Walls', 'Built for giving thanks. These days mostly for praying that you go somewhere else.'],
  city_shop: ['Potion shop', 'Inside the Walls', 'Sells red potions to adventurers at four times what they cost. Its best week ever was the week you turned up.'],
  city_pub: ['Pub', 'Inside the Walls', 'Every raid starts here. Forty people, one table, nobody has read the guide yet.'],
  city_inn: ['The big inn', 'Inside the Walls', 'Where the forty-man goes to sleep off the wipe. Three floors, all of them flammable.'],
  city_fountain: ['Fountain', 'Inside the Walls', 'People throw coins in it and make wishes. Lately the wishes have all been about you.'],
  city_tent: ['Market tent', 'Inside the Walls', 'A roof to sell things under, folded up every night, which is more warning than it got this time.'],
  city_stall: ['Street stall', 'Inside the Walls', 'Sells skewers of something to people on their way to fight you. Doing very well out of it.'],
  city_lamp: ['Street lamp', 'Inside the Walls', 'Lit so nobody gets mugged on the way home. You are not technically a mugger.'],
  cf_wall: ['Castle curtain', 'Inside the Walls', 'The wall around the wall around the king. The king likes walls.'],
  cf_tower: ['Castle front tower', 'Inside the Walls', 'Stands either side of the castle gate looking stern. Stern is not structural.'],
  cf_gate: ['Castle gate', 'Inside the Walls', 'The last door between you and the castle. Locked, barred and, in the end, optional.'],
  castle_wall: ['Castle wall', 'The Castle', 'Holds the castle up and the rabble out. You are not rabble. You are worse.'],
  castle_tower: ['Castle tower', 'The Castle', 'Tall, round and full of stairs nobody likes. Comes down in a long line, if you let it.'],
  castle_gate: ['Castle doors', 'The Castle', 'Oak and iron, very old, very thick. Burns, given time.'],
  castle_keep: ['The keep', 'The Castle', 'Where the king keeps himself. Called a keep because it is the last thing kept. Not this time.'],
};
const STOCK_BUILDING = ['A building', 'somewhere', 'Somebody built it for a reason. The reason was not you.'];

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
    out.push({ n: 'u:' + cls, name: cls === 'rider' ? 'The quiet man' : cls === 'king' ? 'The king' : title(cls), tag: ROLE[c.role] || title(c.role), abil, stats: heroStats(c), desc, shot: () => unitShot(g, cls) });
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
    if (!d || SECRET.has(kind)) return;
    const [name, desc] = CRITTER[kind] || [title(kind), STOCK_CRITTER];
    out.push({ n: 'c:' + kind, name, tag: d.leaves ? 'Leaves if it can' : 'Bystander', abil: d.raise ? 'Runs away. Can be raised from the dead.' : 'Runs away.',
      stats: `HP ${d.hp} · speed ${d.spd}, ${d.flee} when it has seen you${d.value.pts ? ` · worth ${d.value.pts} points` : ''}`, desc, shot: () => critterShot(g, kind) });
  };
  add('villager');
  const horse = { x: AT.x, y: AT.y, face: 0, walk: 0 };
  out.push({ name: 'The quiet man\'s horse', tag: 'Accomplice', abil: 'Carries him in. Waits. Carries him out again if there is anything left to carry.',
    stats: 'No health bar. Faster than you. Cannot be stepped on, and you have tried.',
    desc: 'It did not help. It would like it noted that it did not help.', shot: () => isolate(AT.x, AT.y, c => drawThing.horse(c, horse, g)) });
  for (const k of ['cart', 'horse', 'pig', 'chicken', 'rat']) add(k);
  for (const k of Object.keys(CRITTERS)) if (!['villager', 'cart', 'horse', 'pig', 'chicken', 'rat'].includes(k)) add(k);
  for (const [cls, c] of Object.entries(CLASS)) {
    if (!isPet(c)) continue;
    const [name, desc] = PETS[cls] || [title(cls), STOCK_PET];
    out.push({ n: 'u:' + cls, name, tag: 'Pet', abil: c.bolt ? `Throws ${c.bolt}s from behind its owner.` : 'Bites. Goes in before anyone said go.', stats: heroStats(c), desc, shot: () => unitShot(g, cls) });
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

// The city wall's and the castle front's sections are painted as part of their level's backdrop rather than as props
// of their own, so their portraits are cut out of the level itself: the level loaded, the camera on the section, the
// boss well out of shot, one frame rendered with no HUD.
const IN_SCENE = { wl_curtain: 5, wl_tower: 5, wl_gate: 5, cf_wall: 6, cf_tower: 6, cf_gate: 6 };
let sceneR = null;
function sceneShot(kind) {
  sceneR ||= createRenderer();
  const g = createGame(5);
  jumpToLevel(g, IN_SCENE[kind]);
  const all = g.props.filter(q => q.kind === kind);
  const p = all[Math.floor(all.length / 2)];
  if (!p) return isolate(AT.x, AT.y, () => {});
  g.units.length = 0; g.critters.length = 0; g.texts.length = 0; g.barks.length = 0; g.banner = null; g.thought = null;
  g.boss.x = p.x; g.boss.y = p.y + 400;
  g.cam.x = Math.round(p.x - 160); g.cam.y = 0;
  const buf = sceneR.render(g, { mx: 0, my: 0, cursor: false, bare: true });
  const x0 = Math.max(0, Math.round(p.x - p.w / 2 - g.cam.x) - 2), x1 = Math.min(buf.width - 1, Math.round(p.x + p.w / 2 - g.cam.x) + 1);
  const y0 = Math.max(0, Math.round(p.y - p.h / 2 - g.cam.y) - 6), y1 = Math.min(buf.height - 1, Math.round(p.y + p.h / 2 - g.cam.y) + 2);
  return { cv: buf, empty: false, x0, y0, x1, y1 };
}

// a prop by itself, standing, in the lab (big ones get a big scratch canvas)
function propShot(g, kind) {
  if (IN_SCENE[kind]) return sceneShot(kind);
  g.props.length = 0;
  let p = null;
  try { p = addProp(g, kind, AT.x, AT.y); } catch { return isolate(AT.x, AT.y, () => {}); }
  const iso = isolate(AT.x, AT.y, c => drawThing.prop(c, p, g), { hx: 90, up: 130, down: 50 });
  g.props.length = 0;
  return iso;
}
function plants() {
  const g = specimenGame();
  return Object.keys(PLANT).filter(k => KINDS[k]).map(k => {
    const d = KINDS[k], [name, latin, where, desc] = PLANT[k] || STOCK_PLANT;
    return { n: 'p:' + k, name, tag: latin, abil: `Grows in ${where}.`, stats: `HP ${d.hp} · ${d.flammable ? 'burns' : 'does not burn'}${d.value.pts ? ` · worth ${d.value.pts} points` : ''}`, desc, shot: () => propShot(g, k) };
  });
}
function buildings() {
  const g = specimenGame();
  return Object.keys(BUILDING).filter(k => KINDS[k]).map(k => {
    const d = KINDS[k], [name, where, desc] = BUILDING[k] || STOCK_BUILDING;
    return { n: 'p:' + k, name, tag: where, abil: 'Why it is there:', stats: `HP ${d.hp} · ${d.flammable ? 'burns' : 'stone: knock it down'}${d.value.pts ? ` · worth ${d.value.pts} points` : ''}`, desc, shot: () => propShot(g, k) };
  });
}

const SECTIONS = [
  { name: 'Heroes', lead: 'The ones who come to you. They met an hour ago, or they read the guide, or they brought a horse.', list: heroes, extra: habits },
  { name: 'Everyone else', lead: 'Not here for you. In the way all the same.', list: others },
  { name: 'Plants', lead: 'Things that grow, and burn, and cannot get out of the way.', list: plants },
  { name: 'Buildings', lead: 'Things people built, and why they bothered.', list: buildings },
];

export function createHumanstiary() {
  const body = $('humBody'), prev = $('humPrev'), next = $('humNext'), label = $('humPage');
  let pages = [], at = 0, builtFor = '';

  const entry = e => `<div class="hum"><figure class="pic"><canvas width="72" height="72" aria-hidden="true"></canvas>` +
    (e.n ? `<figcaption class="cnt" title="How many you have killed or destroyed">${count(e.n).toLocaleString()}</figcaption>` : '') + `</figure><div><b class="nm">${e.name}</b><span class="tag">${e.tag}</span>` +
    `<span class="abil">${e.abil}</span><span class="stat">${e.stats}</span><span class="desc">${e.desc}</span></div></div>`;
  const pageHTML = (sec, items, first) => `<p class="humLead"><b>${sec.name}.</b> ${sec.lead}</p>` + (first && sec.extra ? sec.extra() : '') +
    '<div class="humList">' + items.map(entry).join('') + '</div>';
  const overflows = () => { const c = body.closest('.card'); return c.scrollHeight > c.clientHeight + 1; };

  // Lays every section out in pages that fit the card as it is now: entries go on until the next one would make the
  // card scroll. Each section starts on a page of its own. Done again whenever the window changes size.
  function build() {
    pages = [];
    for (const sec of SECTIONS) {
      let list = [];
      try { list = sec.list(); } catch (e) { console.warn('humanstiary:', e.message); }
      let cur = [], first = true;
      for (const e of list) {
        body.innerHTML = pageHTML(sec, [...cur, e], first);
        if (overflows() && cur.length) { pages.push({ sec, items: cur, first }); cur = [e]; first = false; }
        else cur.push(e);
      }
      if (cur.length) pages.push({ sec, items: cur, first });
    }
    builtFor = innerWidth + 'x' + innerHeight;
  }

  function show(n) {
    at = Math.max(0, Math.min(pages.length - 1, n));
    const p = pages[at];
    body.innerHTML = pageHTML(p.sec, p.items, p.first);
    // the scratch canvas is shared, so each portrait is drawn just before it is copied out
    const frames = body.querySelectorAll('.hum canvas');
    p.items.forEach((e, i) => portrait(frames[i], e.shot()));
    const mine = pages.filter(q => q.sec === p.sec), k = mine.indexOf(p) + 1;
    label.textContent = `${p.sec.name}${mine.length > 1 ? ` (${k} of ${mine.length})` : ''} · page ${at + 1} of ${pages.length}`;
    prev.setAttribute('aria-disabled', at === 0);
    next.setAttribute('aria-disabled', at === pages.length - 1);
  }
  // a page either way; false when there is no page that way
  const turn = d => {
    if ((d < 0 && at > 0) || (d > 0 && at < pages.length - 1)) { show(at + d); return true; }
    return false;
  };
  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  addEventListener('resize', () => {
    if (!body.offsetParent || builtFor === innerWidth + 'x' + innerHeight) return;
    const keep = pages[at]?.items[0];
    build();
    show(Math.max(0, pages.findIndex(p => p.items.some(e => e.name === keep?.name))));
  });

  return { open(n = 0) { build(); show(n); }, turn, get page() { return at; }, tab: () => next };
}
