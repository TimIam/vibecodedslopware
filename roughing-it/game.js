// Roughing It: a trail game after Mark Twain's 1872 book of the same name.
// Three acts: the Overland stage (St. Joseph to Carson City, 1861), silver fever in Nevada,
// and a reporter's desk in Virginia City. All the narration is written for this game; the
// events follow the book's story. One file, no build: state, story, scene painter, sound.
'use strict';

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const START = new Date(1861, 6, 26); // the stage left St. Joseph at the end of July, 1861
const BEST_KEY = 'roughing-it-best';

// ---------------------------------------------------------------- items
const ITEMS = {
  dictionary: { name: 'Unabridged Dictionary', lb: 12, cost: 0, note: 'Six pounds of words, twice over. Good for a writer. Murderous on a rough road.' },
  pistol: { name: 'Smith & Wesson seven-shooter', lb: 2, cost: 12, note: 'Shoots a ball like a homeopathic pill. Makes a man feel armed.' },
  pipe: { name: 'Pipe & tobacco', lb: 2, cost: 4, note: 'Keeps the spirits up a little every day.' },
  blankets: { name: 'Wool blankets', lb: 6, cost: 6, note: 'The mountain nights are cold, even in August.' },
  canteen: { name: 'Canteen', lb: 2, cost: 3, note: 'There is a desert out there that has heard of you.' },
  coat: { name: 'Heavy coat & boots', lb: 7, cost: 15, note: 'Nevada has winters. Nobody mentions this.' },
  cards: { name: 'Deck of cards', lb: 1, cost: 1, note: 'For station poker. For better or worse.' },
  whiskey: { name: 'Jug of whiskey', lb: 4, cost: 3, note: 'Medicinal. Also currency.' },
  notebook: { name: 'Notebook & pencils', lb: 1, cost: 2, note: 'For writing it all down. You will want to.' },
  medicine: { name: 'Patent medicine', lb: 1, cost: 5, note: 'Cures everything, according to the bottle.' },
};
const LIMIT = 25; // the stage company allowed each passenger twenty-five pounds

// ---------------------------------------------------------------- the route
// Miles are approximate; the book puts the whole run at about 1,700 miles.
const ROUTE = 1700;
const STOPS = [
  { mi: 0, name: 'St. Joseph, Missouri', region: 'plains' },
  { mi: 290, name: 'Fort Kearney', region: 'plains', ev: 'pony' },
  { mi: 470, name: 'Julesburg', region: 'plains', ev: 'mudwagon' },
  { mi: 600, name: "Scott's Bluffs", region: 'bluffs', ev: 'bluffs' },
  { mi: 840, name: 'Rocky Ridge station', region: 'rockies', ev: 'slade' },
  { mi: 900, name: 'South Pass', region: 'rockies', ev: 'southpass' },
  { mi: 1030, name: 'Green River', region: 'rockies', ev: 'greenriver' },
  { mi: 1200, name: 'Great Salt Lake City', region: 'salt', ev: 'saltlake' },
  { mi: 1380, name: 'the alkali desert', region: 'desert', ev: 'alkali' },
  { mi: 1700, name: 'Carson City, Nevada Territory', region: 'town', ev: 'carson' },
];
function regionAt(mi) { let r = 'plains'; for (const s of STOPS) if (mi >= s.mi - 60) r = s.region; return mi > 1500 && mi < 1650 ? 'desert' : r; }

// ---------------------------------------------------------------- state
let S;
function fresh() {
  return {
    act: 'title', day: 0, mi: 0, money: 340, hp: 80, sp: 75, items: {}, seat: 'inside',
    stopIdx: 0, flags: {}, week: 0, readers: 10, trouble: 0, issue: 0, feet: {}, claims: 0,
    journal: [], weeks: 0, score: 0, vices: true,
  };
}
const has = k => !!S.items[k];
function dateStr() {
  const d = new Date(START.getTime() + S.day * 864e5);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
// Deal from a shuffled deck per list, so flavour lines don't repeat until all have been used.
const decks = new Map();
function deal(arr) {
  let d = decks.get(arr);
  if (!d || !d.length) { d = [...arr].sort(() => Math.random() - .5); decks.set(arr, d); }
  return d.pop();
}
function log(t) { S.journal.unshift(t); S.journal.length = Math.min(S.journal.length, 40); }

// Apply deltas and return a short readout like "+5 spirits, −$3".
function fx(d) {
  const out = [];
  if (d.money) { S.money += d.money; out.push((d.money > 0 ? '+' : '') + money(d.money).replace('$', '$')); }
  if (d.hp) { const b = S.hp; S.hp = clamp(S.hp + d.hp, 0, 100); if (S.hp !== b) out.push(`${d.hp > 0 ? '+' : '−'}${Math.abs(S.hp - b)} health`); }
  if (d.sp) { const b = S.sp; S.sp = clamp(S.sp + d.sp, 0, 100); if (S.sp !== b) out.push(`${d.sp > 0 ? '+' : '−'}${Math.abs(S.sp - b)} spirits`); }
  if (d.day) { S.day += d.day; out.push(`${d.day} day${d.day > 1 ? 's' : ''} lost`); }
  if (d.readers) { S.readers = Math.max(0, S.readers + d.readers); out.push(`${d.readers > 0 ? '+' : '−'}${Math.abs(d.readers)} readers`); }
  if (d.trouble) { S.trouble = clamp(S.trouble + d.trouble, 0, 100); out.push(`${d.trouble > 0 ? '+' : '−'}${Math.abs(d.trouble)} trouble`); }
  if (d.lose) for (const k of [].concat(d.lose)) if (S.items[k]) { delete S.items[k]; out.push(`lost: ${ITEMS[k].name}`); }
  if (d.gain) for (const k of [].concat(d.gain)) if (!S.items[k]) { S.items[k] = 1; out.push(`got: ${ITEMS[k].name}`); }
  const good = (d.hp || 0) + (d.sp || 0) + (d.money || 0) / 5 + (d.readers || 0) - (d.trouble || 0) - (d.day || 0) * 5 >= 0;
  sfx(good ? 'good' : 'bad');
  return out.length ? `<p class="fx${good ? '' : ' bad'}">${out.join(' · ')}</p>` : '';
}

// ---------------------------------------------------------------- page rendering
const page = $('page');
// show({title, where, body, choices:[{t, sub, if, go}]}) — `go` returns either a string of
// HTML to show as the outcome (with a Continue button), or nothing if it moved on itself.
function show(o, after) {
  let h = `<h2>${o.title}</h2>`;
  if (o.where) h += `<p class="where">${o.where}</p>`;
  h += o.body;
  page.innerHTML = h + '<div class="choices"></div>';
  const box = page.querySelector('.choices');
  for (const c of o.choices || []) {
    if (c.if && !c.if()) continue;
    const b = document.createElement('button');
    b.className = 'btn' + (c.big ? ' big' : '');
    b.innerHTML = c.t + (c.sub ? `<br><small>${c.sub}</small>` : '');
    if (c.disabled) b.disabled = true;
    b.onclick = () => {
      sfx('click');
      const r = c.go();
      if (typeof r === 'string') outcome(o.title, r, c.next || after);
    };
    box.appendChild(b);
  }
  hud();
  page.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function outcome(title, html, next) {
  hud();
  if (checkDeath()) return;
  show({ title, body: html, choices: [{ t: 'Continue →', go: () => { next(); } }] });
}
function hud() {
  $('when').textContent = S.act === 'title' ? 'July 1861' : dateStr();
  $('phase').textContent = (window.ACT_LABELS && ACT_LABELS[S.act]) ? ACT_LABELS[S.act]() : S.act === 'stage' ? (S.mi >= ROUTE ? 'Carson City' : 'Overland stage') : S.act === 'nevada' ? 'Carson City' : S.act === 'paper' ? 'Virginia City' : S.act === 'end' ? 'The End' : 'St. Joseph';
  $('money').textContent = money(S.money);
  $('milesRow').hidden = S.act !== 'stage' && S.act !== 'outfit';
  $('miles').textContent = `${Math.max(0, ROUTE - S.mi).toLocaleString()} mi`;
  bar('hp', S.hp); bar('sp', S.sp);
  $('paperStats').hidden = !['paper', 'sf', 'pacific', 'lecture'].includes(S.act);
  bar('rd', Math.min(100, S.readers / 4), S.readers); bar('tr', S.trouble);
  const bag = Object.keys(S.items).map(k => `<li>${ITEMS[k].name}</li>`);
  if (S.mkt) {
    const f = Object.entries(S.feet).filter(([, v]) => v > 0).map(([k, v]) => `<li>${v} ft of ${k}</li>`);
    bag.push(...f);
  }
  $('bag').innerHTML = bag.join('') || '<li>nothing but the clothes you stand in</li>';
  $('journal').innerHTML = S.journal.map(t => `<div>${t}</div>`).join('');
  if (window.drawMap) drawMap();
}
function bar(id, v, label) {
  const f = $(id + 'Bar'); f.style.width = clamp(v, 0, 100) + '%';
  if (id === 'hp' || id === 'sp') f.classList.toggle('warn', v < 45), f.classList.toggle('bad', v < 22);
  $(id).textContent = Math.round(label ?? v);
}
function checkDeath() {
  if (S.hp <= 0) { ending('laid'); return true; }
  if (S.sp <= 0) { ending('quit'); return true; }
  return false;
}

// ---------------------------------------------------------------- ACT 0: title + outfit
function title() {
  S = fresh(); scene.set('river'); hud();
  const best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  show({
    title: 'Roughing It',
    where: 'St. Louis, July 1861',
    body: `<p>Your brother Orion has been made Secretary of the new Nevada Territory, and you have been made, by your own appointment, his private secretary. The salary is nothing. The duties are unknown. The prospects are, in your considered opinion, magnificent.</p>
      <p>You have never been west of the Missouri. You picture Indians, buffalo, gold lying about in nuggets, and yourself coming home in a year or two with a fortune and a great many stories. You will be right about the stories.</p>
      <p>Six days up the Missouri by steamboat brings you to St. Joseph and the Overland stage: <b>1,700 miles</b> to Carson City at about a hundred miles a day, fare $150, paid in advance.</p>
      <blockquote>A trail game after Mark Twain's <i>Roughing It</i> (1872), in three parts: <b>Nevada</b> (the stage, the silver mines, the newspaper), <b>San Francisco</b>, and <b>the Pacific</b>.</blockquote>
      ${best ? `<p class="foot">Best tale so far: ${best.score} points (${esc(best.title)}).</p>` : ''}`,
    choices: [{ t: 'Buy a ticket west', big: true, go: () => { audio(); outfit(); } }],
  });
}

function outfit() {
  S.act = 'outfit'; scene.set('town', { sign: 'ST. JOSEPH' });
  const chosen = new Set(['dictionary']);
  const render = () => {
    const lb = [...chosen].reduce((s, k) => s + ITEMS[k].lb, 0);
    const cost = [...chosen].reduce((s, k) => s + ITEMS[k].cost, 0);
    const over = lb > LIMIT;
    show({
      title: 'Twenty-five pounds',
      where: 'The Overland office, St. Joseph',
      body: `<p>The stage company allows each passenger twenty-five pounds of baggage. Your swallow-tail coat, white kid gloves and patent-leather boots must go home on the steamboat. Choose what rides with you. Orion insists on the dictionary; you may overrule him.</p>
        <div class="items">${Object.entries(ITEMS).map(([k, it]) => `<button class="item${chosen.has(k) ? ' on' : ''}" data-k="${k}"><span><b>${it.name}</b><small>${it.note}</small></span><span class="wt">${it.lb} lb${it.cost ? `<br>$${it.cost}` : ''}</span></button>`).join('')}</div>
        <p class="scale${over ? ' over' : ''}">${lb} / ${LIMIT} lb · ${money(cost)} of your ${money(S.money)}${over ? ' · the agent shakes his head' : ''}</p>`,
      choices: [{ t: over ? 'Too heavy: put something back' : 'Climb aboard the coach', big: true, disabled: over || cost > S.money, go: () => {
        S.money -= cost; for (const k of chosen) S.items[k] = 1;
        log(`Left St. Joseph with Orion and ${chosen.size === 1 ? 'one thing' : chosen.size + ' things'}.`);
        S.act = 'stage'; stageDay(true);
      } }],
    });
    page.querySelectorAll('.item').forEach(b => b.onclick = () => { sfx('click'); const k = b.dataset.k; chosen.has(k) ? chosen.delete(k) : chosen.add(k); render(); });
  };
  render();
}

// ---------------------------------------------------------------- ACT 1: the stage
function stageDay(first) {
  if (checkDeath()) return;
  S.act = 'stage';
  const next = STOPS[S.stopIdx + 1];
  const region = regionAt(S.mi);
  scene.set(region, { coach: true });
  const seatTxt = S.seat === 'top' ? 'up on the box beside the driver' : 'inside, on the mail sacks';
  show({
    title: first ? 'Part I: Nevada · the Overland stage' : `Day ${S.day + 1} on the road`,
    where: `${S.mi.toLocaleString()} miles out · next: ${next.name} (${next.mi - S.mi} mi) · riding ${seatTxt}`,
    body: first
      ? `<p>The coach is a great swinging cradle on leather thoroughbraces, drawn by six horses and bound for the sunset. The baggage is in the boot, the mail is piled to the windows inside, and you are on top of it. The driver cracks his whip. You are off.</p>`
      : `<p>${deal(flavor[region])}</p>`,
    choices: [
      { t: 'Ride on', sub: 'a day of travel, about a hundred miles', go: travel },
      { t: S.seat === 'top' ? 'Climb inside onto the mail sacks' : 'Climb up beside the driver', sub: S.seat === 'top' ? 'warmer, safer, duller' : 'better views and better lies; worse weather', go: () => { S.seat = S.seat === 'top' ? 'inside' : 'top'; stageDay(); } },
      { t: 'Lay over a day at the station', sub: 'rest up (+health, +spirits) for $3 and a day', go: () => { S.day++; return `<p>You let the coach go on without you and sleep in a real bunk under a real roof. The station keeper's wife feeds you something that is nearly bread.</p>` + fx({ hp: 12, sp: 6, money: -3 }); }, next: () => stageDay() },
      { t: 'Take a dose of patent medicine', if: () => has('medicine') && S.hp < 70, go: () => `<p>It tastes of turpentine and good intentions. You feel better at once, possibly from fright.</p>` + fx({ hp: 15, lose: 'medicine' }), next: () => stageDay() },
    ],
  });
}

function travel() {
  scene.roll(1500);
  const dist = ri(85, 120);
  const before = S.mi;
  S.mi = Math.min(ROUTE, S.mi + dist); S.day++;
  const region = regionAt(S.mi);
  // daily wear: the coach is hard on everyone
  let d = { hp: -2, sp: -2 };
  if (S.seat === 'top') d.sp += 4;
  if (has('pipe')) d.sp += 2;
  if ((region === 'rockies' || region === 'sierra') && !has('blankets')) d.hp -= 3;
  const daily = fx(d);
  // did we reach a fixed stop?
  const next = STOPS[S.stopIdx + 1];
  setTimeout(() => {
    if (next && S.mi >= next.mi) {
      S.stopIdx++; S.mi = Math.max(S.mi, next.mi);
      log(`Day ${S.day}: reached ${next.name}.`);
      if (EV[next.ev]) return EV[next.ev](daily);
    }
    if (Math.random() < .72) return randomEvent(daily, before);
    outcome(`Day ${S.day}`, `<p>${deal(quiet)}</p>` + daily, stageDay);
  }, 1500);
  page.querySelectorAll('button').forEach(b => b.disabled = true);
}

const flavor = {
  plains: ['The plains roll off in every direction like a green sea that has given up. The road is a single dusty seam across it.', 'Prairie dogs sit on their mounds and watch you go by with the air of creditors.', 'The sky out here is a great deal larger than the one back home, and it does not seem to know you.'],
  bluffs: ['Sandstone bluffs stand up out of the plain like the ruins of a city nobody bothered to build.', 'The North Platte runs alongside, wide and shallow and the colour of coffee with milk.'],
  rockies: ['The road climbs. The air thins and sharpens. Snow on the far peaks in August, which strikes you as showing off.', 'Sagebrush everywhere: grey-green, knee-high, and smelling like a medicine cabinet.', 'The mules are swapped for fresh ones every ten miles or so. You envy the mules.'],
  salt: ['The valley of the Great Salt Lake opens below, green and irrigated and astonishingly tidy.'],
  desert: ['Nothing but alkali dust, white and fine as flour, in the eyes and teeth and soul.', 'The sun bakes the coach like a loaf. The horizon trembles in the heat.'],
  town: ['Carson City is near.'],
};
const quiet = [
  'An uneventful day, if you do not count the jolting, the dust, the heat, the cold, and the mail sacks, which you have come to know personally.',
  'You count sagebrush for an hour. You lose count. You start again.',
  'The driver tells you a story about a man in Julesburg that you suspect is about the driver.',
  'A long, rocking, dozing day. You wake each time the coach hits a hole, which is often, and dream of beds.',
  'You change horses at a station every few hours. Each station keeper is shabbier and more cheerful than the last.',
  'Orion reads the laws of Nevada Territory aloud from a pamphlet. There are not many laws yet. He reads them twice.',
  'A passenger snores in a key you did not know existed. By noon you can hum along.',
  'The mail sacks shift in the night and you wake with a letter to a Mrs. Hopkins of Sacramento pressed into your cheek.',
  'The driver lets you hold the reins for a mile on the flat. The horses know at once and treat you accordingly.',
  'A wagon train of emigrants creaks past going the same way at a tenth of the speed. You wave. They do not.',
  'You discover that a man can sleep sitting up, lying down, or wedged at a diagonal, but not well in any of them.',
  'Dinner at the station is beans. Supper is the beans that were left over from dinner, with an apology.',
  'A dust devil whirls along beside the coach for a while like a friendly ghost, then wanders off to bother someone else.',
  'You try to write a letter home and produce a page that looks like an earthquake signed it.',
  'At a lonely station a little girl shows you her pet prairie dog, which bites you. She is very proud of it.',
  'The driver points out a hill that he says is haunted, then another, then admits most of them are.',
  'The night is so clear that the stars seem close enough to rattle when the coach hits a rut.',
];

// Random road events. `if` limits where they can happen; `once` means at most once per trip.
const ROAD = [
  { id: 'dict', once: 1, if: () => has('dictionary') && S.mi > 150, go: daily => show({
    title: 'The dictionary', body: `<p>The coach plunges into a gully and comes up the far side at a run. Everything inside rises into the air together: you, Orion, the mail, the water canteen, and the Unabridged Dictionary, which comes down on you corner-first like the wrath of a schoolmaster. It does this again at the next gully, and the next. By noon it has bruised every passenger and learned nothing.</p>${daily}`,
    choices: [
      { t: 'Pitch it out of the window', go: () => `<p>It lands open in the sagebrush, somewhere in the middle of the letter M. You feel lighter, and somehow less educated.</p>` + fx({ sp: 6, lose: 'dictionary' }) },
      { t: 'Keep it; a writer needs words', go: () => `<p>You wedge it under the mail sacks. It escapes twice more before dark.</p>` + fx({ hp: -8 }) },
    ] }, stageDay) },
  { id: 'jack', once: 1, if: () => S.mi < 900, go: daily => outcome('A jackass rabbit', `<p>A rabbit with ears like a mule's sits by the road and considers you. The driver fires a shot near it to show you what it can do, and it lays its ears back and leaves for the horizon at a speed that would embarrass the telegraph. You never knew a rabbit could express contempt.</p>` + fx({ sp: 8 }) + daily, stageDay) },
  { id: 'coyote', once: 1, go: daily => outcome('A coyote', `<p>A coyote trots alongside for a mile: a thin, hungry, disreputable thing with a tail that apologises for the rest of him. When a town dog from the station comes out to chase it, the coyote merely lopes a little faster, glancing back with mild interest, until the dog is miles from home and wondering where all his confidence went.</p>` + fx({ sp: 6 }) + daily, stageDay) },
  { id: 'slum', go: daily => show({
    title: 'Station breakfast', body: `<p>At the station the keeper serves a drink called slumgullion. It pretends to be tea, but there is too much dishrag, sand and old bacon rind in it to deceive the intelligent traveller. Beside it lies a lump of bread and some bacon that has evidently seen army service.</p>${daily}`,
    choices: [
      { t: 'Eat it all, like a westerner', go: () => Math.random() < .55 ? `<p>It stays down. You feel you have passed some initiation.</p>` + fx({ hp: 4, sp: 3 }) : `<p>It does not stay down.</p>` + fx({ hp: -7 }) },
      { t: 'Pay a dollar for the keeper\'s private eggs', go: () => `<p>Two eggs, fried by a man who has evidently heard of eggs. Worth every cent.</p>` + fx({ money: -1, hp: 6 }) },
      { t: 'Skip it', go: () => `<p>You go hungry and smug.</p>` + fx({ hp: -3 }) },
    ] }, stageDay) },
  { id: 'brace', go: daily => show({
    title: 'A broken thoroughbrace', body: `<p>With a crack like a rifle shot one of the leather straps the coach swings on gives way, and the whole body sags over on one side like a tired cow.</p>${daily}`,
    choices: [
      { t: 'Help the driver mend it', go: () => `<p>Two hours of rawhide, profanity and leverage. The driver says you curse like a natural and you take it kindly.</p>` + fx({ sp: 4, hp: -3 }) },
      { t: 'Sit in the shade and offer advice', go: () => `<p>It takes the rest of the day. Your advice is not taken.</p>` + fx({ day: 1, sp: -2 }) },
    ] }, stageDay) },
  { id: 'poker', if: () => has('cards'), go: daily => show({
    title: 'A game at the station', body: `<p>A pair of freighters at the station have a table, a lamp and an expression of great innocence. They would welcome a friendly hand.</p>${daily}`,
    choices: [
      { t: 'Play for $10', if: () => S.money >= 10, go: () => Math.random() < .45 ? `<p>You win, which surprises everyone, you most of all.</p>` + fx({ money: ri(14, 30), sp: 6 }) : `<p>Their innocence was, it turns out, an act.</p>` + fx({ money: -10, sp: -4 }) },
      { t: 'Decline politely', go: () => `<p>They seem genuinely hurt. You keep your money.</p>` },
    ] }, stageDay) },
  { id: 'storm', if: () => S.mi < 1100, go: daily => outcome('Thunderstorm', S.seat === 'top'
    ? `<p>A storm comes over the plain in a black wall and breaks right on top of you. Up on the box there is nowhere to go. The lightning is close enough to read by. You arrive at the next station soaked to the bone and greatly impressed.</p>` + fx({ hp: -9, sp: 3 }) + daily
    : `<p>A storm rolls over the plain. Inside the coach, snug among the mail, you watch the lightning walk across the prairie on legs of fire. It is the finest show you have ever seen and you did not pay for it.</p>` + fx({ sp: 6 }) + daily, stageDay) },
  { id: 'liar', if: () => S.seat === 'top', go: daily => outcome('The driver talks', `<p>The driver points with his whip to a hill where, he says, he once outran a band of road agents with the mules on fire and the mail sacks singing hymns. You believe every word, and decide this is the right way to tell a story: absolutely straight-faced and a little bigger than the facts.</p>` + fx({ sp: 9 }) + (has('notebook') ? '<p>You write it all down.</p>' : '') + daily + ((S.flags.lies = (S.flags.lies || 0) + 1), ''), stageDay) },
  { id: 'buffalo', once: 1, if: () => S.mi > 200 && S.mi < 700, go: daily => outcome('Bemis and the buffalo', `<p>At the station a fellow passenger named Bemis comes back from a buffalo hunt with his clothes torn and his dignity in worse shape. The bull chased him, he says, and he climbed a tree, and the bull climbed after him. Someone points out that buffalo cannot climb trees. Bemis says this one could, because he was so mad. Nobody can prove otherwise.</p>` + fx({ sp: 10 }) + daily, stageDay) },
  { id: 'river', if: () => S.mi < 1100, go: daily => show({
    title: 'High water at the crossing', body: `<p>The river ahead is up and running fast and brown. The driver looks at it, and then looks at the passengers, and offers you the choice like a host offering a second helping.</p>${daily}`,
    choices: [
      { t: 'Ford it now', go: () => Math.random() < .7 ? `<p>The coach floats for a terrible moment and then the wheels find the bottom. Everyone cheers, including the mules.</p>` + fx({ sp: 5 }) : `<p>The coach lurches and dumps half the passengers into the river. You are fished out downstream, wetter and wiser.</p>` + fx({ hp: -10, lose: pick(Object.keys(S.items)) }) },
      { t: 'Wait for the water to drop', go: () => `<p>You wait a day by the bank. The river goes down, and so do your spirits.</p>` + fx({ day: 1, sp: -4, hp: 3 }) },
    ] }, stageDay) },
  { id: 'agents', if: () => S.mi > 400, go: daily => show({
    title: 'Rumours of road agents', body: `<p>At the station there is talk that road agents have been stopping coaches on this stretch. The other passengers start hiding money in their boots, their hats and each other.</p>${daily}`,
    choices: [
      { t: 'Keep your seven-shooter in your lap', if: () => has('pistol'), go: () => `<p>Nothing happens. You decide your pistol frightened them off, and nobody can prove otherwise.</p>` + fx({ sp: 6 }) },
      { t: 'Hide your money in the dictionary', if: () => has('dictionary'), go: () => `<p>Under "Q". No robber would ever look under Q.</p>` + fx({ sp: 4 }) },
      { t: 'Sit tight and worry', go: () => Math.random() < .25 ? `<p>Two men with flour-sack masks stop the coach at dusk. They are polite, quick, and gone with some of your money.</p>` + fx({ money: -Math.min(S.money, ri(20, 60)), sp: -8 }) : `<p>Nothing happens, though you lie awake all night making sure of it.</p>` + fx({ hp: -3 }) },
    ] }, stageDay) },
];

function randomEvent(daily) {
  const pool = ROAD.filter(e => (!e.if || e.if()) && !S.flags['ev_' + e.id]);
  if (!pool.length) return outcome(`Day ${S.day}`, `<p>${deal(quiet)}</p>` + daily, stageDay);
  const e = pick(pool);
  S.flags['ev_' + e.id] = 1;
  e.go(daily);
}

// Fixed events at the big stops along the road.
const EV = {
  pony: daily => { scene.set('plains', { coach: true, pony: true }); outcome('The Pony Express!', `<p>Near Fort Kearney the driver shouts, "Here he comes!" Far off across the plain a black speck appears, grows, becomes a horse and rider sweeping toward you, and is past in a whoosh of wind and a wave of the hand, the mail pouch bouncing behind him. Then he is a speck again, and then nothing. It is over in a moment, and you would not have missed it for the fare.</p>` + fx({ sp: 14 }) + daily, stageDay); },
  mudwagon: daily => show({
    title: 'Julesburg: change of coaches', where: 'Overland City, also called Julesburg',
    body: `<p>At Julesburg your fine coach is swapped for a "mud-wagon", a cheaper, harder rig. There is less room, and the agent eyes your baggage with fresh suspicion. The mail must go through. The passengers' comfort is less certain.</p>${daily}`,
    choices: [
      { t: 'Argue for your things', go: () => Math.random() < .5 ? `<p>You win the argument by not stopping talking. The agent gives up.</p>` + fx({ sp: 4 }) : `<p>The agent wins by simply throwing something off.</p>` + fx({ lose: pick(Object.keys(S.items)), sp: -4 }) },
      { t: 'Bribe the agent with whiskey', if: () => has('whiskey'), go: () => `<p>The agent finds your baggage weighs exactly nothing.</p>` + fx({ lose: 'whiskey', sp: 3 }) },
    ] }, stageDay),
  bluffs: daily => outcome("Scott's Bluffs", `<p>The bluffs rise from the plain like a fortress, and the driver says a man died beneath them, years ago, alone and abandoned by his party, and crawled sixty miles before he gave up. He tells this as he tells everything: as though it were the weather.</p><p>You look at the bluffs for a long time after.</p>` + fx({ sp: 2 }) + daily, stageDay),
  slade: daily => { scene.set('rockies', { station: true }); show({
    title: 'Breakfast with Slade', where: 'Rocky Ridge station, in the Rocky Mountains',
    body: `<p>For a week the drivers have talked of Slade, the division agent: a man said to have killed twenty-six men, some of them for very little. You have pictured him as a giant with horns.</p><p>At Rocky Ridge you sit down to breakfast and the gentle, quiet, friendly man at the head of the table, the one who passes the bacon so courteously, turns out to be Slade. There is one cup of coffee left in the pot. He offers it to you.</p>${daily}`,
    choices: [
      { t: 'Politely decline. After you, sir.', go: () => { S.flags.slade = 1; return `<p>He insists, and fills your cup with his own hand, and you drink it under the eye of the most famous desperado in the West. You leave the table more alive than you expected, and very anxious not to have offended him.</p>` + fx({ sp: 10 }); } },
      { t: 'Accept with thanks', go: () => { S.flags.slade = 1; return `<p>You drink it. He smiles. You will spend years wondering whether you were ever in any real danger, and tell the story at every dinner party you attend for the rest of your life.</p>` + fx({ sp: 8 }); } },
      { t: 'Ask him about the twenty-six men', go: () => (S.flags.slade = 1) && `<p>The table goes very quiet. Slade considers you for a long moment, then laughs, and passes you the bacon. Orion kicks you under the table hard enough to raise a lump.</p>` + fx({ hp: -4, sp: 12 }) },
    ] }, stageDay); },
  southpass: daily => outcome('South Pass', `<p>You cross the backbone of the continent so gently you would never know it: a broad, grassy saddle, a few patches of old snow. From here the waters run to the Pacific. In the night the cold comes down off the peaks like a falling wall.</p>` + (has('blankets') ? `<p>You are glad of your blankets.</p>` + fx({ sp: 5 }) : `<p>You have no blankets and spend the night in a shivering heap of mail.</p>` + fx({ hp: -10 })) + daily, stageDay),
  greenriver: daily => show({
    title: 'Green River', body: `<p>At Green River station there is talk of a lame mule that needs shooting and nobody wants to do it. Somebody remembers that you have a pistol.</p>${daily}`,
    choices: [
      { t: 'Show them your seven-shooter', if: () => has('pistol'), go: () => `<p>You aim with great care. The ball goes somewhere. The mule looks around, faintly interested. The station keeper takes the pistol away from you, very gently, and does the job with his own.</p>` + fx({ sp: -3 }) },
      { t: 'Stay out of it', go: () => `<p>You go and admire the river instead. It is very green. The name was not a lie.</p>` + fx({ sp: 3 }) },
    ] }, stageDay),
  saltlake: daily => { scene.set('salt', { coach: true }); show({
    title: 'Great Salt Lake City', where: 'Two days in the City of the Saints',
    body: `<p>After weeks of sagebrush, Salt Lake City is a marvel: broad streets, running water in the gutters, orchards, neat houses, and an air of having been built by people who meant it. The stage lays over two days.</p>${daily}`,
    choices: [
      { t: 'Call on Brigham Young with Orion', go: () => `<p>The great man is calm and kindly and talks to Orion about everything except what Orion came to talk about. When you leave he lays a fatherly hand on your head and asks Orion whether you are his child, and whether a boy or a girl. You were twenty-five. You decide not to bring it up.</p>` + fx({ sp: 10, day: 2 }) },
      { t: 'Try the local "valley tan" whiskey', go: () => `<p>It is said to be made of imported fire and brimstone. You believe it.</p>` + fx({ sp: 12, hp: -6, day: 2 }) },
      { t: 'Rest, eat, and buy a canteen', sub: '$5', if: () => S.money >= 5, go: () => `<p>Two full nights' sleep and real meals at a table. You buy a canteen, because a driver said "the desert" in a tone you did not like.</p>` + fx({ hp: 16, sp: 4, money: -5, gain: 'canteen', day: 2 }) },
    ] }, stageDay); },
  alkali: daily => { scene.set('desert', { coach: true }); show({
    title: 'The alkali desert', where: 'Forty-odd miles without water',
    body: `<p>You had thought a desert would be romantic: shimmering sands, caravans, mirages. It is nothing of the kind. It is forty miles of white alkali dust under a sun like a shovel full of coals, and it rises in a fine cloud that gets into everything a man owns, including his opinions.</p>${daily}`,
    choices: [
      { t: 'Ration the canteen', if: () => has('canteen'), go: () => `<p>Sip by sip, mile by mile. You arrive cracked and white as a miller but on your own feet.</p>` + fx({ hp: -5 }) },
      { t: 'Share the canteen with the mules', if: () => has('canteen'), go: () => `<p>The mules are grateful in the way mules are, which is to say not visibly. But they keep moving, and so do you.</p>` + fx({ hp: -9, sp: 8 }) },
      { t: 'Endure it', go: () => `<p>By the end you have no spit, no voice, and no romance about deserts left at all.</p>` + fx({ hp: has('canteen') ? -8 : -20, sp: -6 }) },
    ] }, stageDay); },
  carson: () => arriveCarson(),
};

function arriveCarson() {
  scene.set('town', { sign: 'CARSON CITY', wind: true });
  const late = S.day > 24;
  const html = `<p>On the twentieth day or so, a wooden town of white frame houses comes out of the dust. Carson City! Before you can admire it, the afternoon <b>Washoe Zephyr</b> arrives: a wind that picks up the town by its loose parts and throws them around. Hats, shingles, tin cans, blankets, dogs and a donkey go past at a respectable height. The locals say that when a stranger sees the Zephyr he either goes home on the next stage or stays for life.</p>
    ${late ? `<p>You are ${S.day - 20} days behind than the timetable. Orion is sworn in only after an anxious week of telegrams.</p>` : '<p>Orion is sworn in as Secretary at once, and you are the private secretary of a man with no office, no desk and no salary.</p>'}`
    + fx({ sp: late ? -5 : 8 });
  outcome('Carson City', html, () => show({
    title: 'Stay or go?', body: `<p>A wind like that is a question. How do you answer?</p>`,
    choices: [
      { t: 'Stay. This is the place.', big: true, go: () => { S.act = 'nevada'; S.week = 0; initMarket(); nevadaWeek(); } },
    ],
  }));
}

// ---------------------------------------------------------------- ACT 2: silver fever
// A week at a time. You can prospect, speculate in mining "feet", or take your chances.
const MINES = [
  { name: 'Ophir', p: 40, vol: .15, drift: .02 },
  { name: 'Gould & Curry', p: 25, vol: .2, drift: .01 },
  { name: 'Wide West', p: 8, vol: .3, drift: 0 },
  { name: 'Root-Hog-or-Die', p: 2, vol: .55, drift: -.03 },
  { name: 'Grand Bilk Consolidated', p: 1.5, vol: .7, drift: -.06 },
];
function initMarket() { S.mkt = MINES.map(m => ({ ...m, last: m.p })); }
function tickMarket() {
  const news = [];
  for (const m of S.mkt) {
    m.last = m.p;
    let r = Math.exp(m.drift + m.vol * (Math.random() + Math.random() + Math.random() - 1.5) * 1.4);
    if (Math.random() < .05) { r = 3; news.push({ m, text: `${m.name} struck a new ledge! The price tripled.` }); }
    else if (Math.random() < .05 && m.p < 30) { r = .15; news.push({ m, text: `${m.name}: the ledge "pinched out". The feet are worth about what the paper is.` }); }
    m.p = Math.max(.1, Math.round(m.p * r * 100) / 100);
  }
  return news;
}

function nevadaWeek(note) {
  S.loc = null;
  S.act = 'nevada';
  scene.set('town', { sign: 'CARSON CITY' });
  const worth = feetWorth();
  if (S.week >= 16 && !S.flags.offer) return reporterOffer('forced');
  show({
    title: `Silver fever: week ${S.week + 1}`,
    where: `Carson City, ${dateStr()} · cash ${money(S.money)}${worth ? ` · feet worth ${money(worth)}` : ''}`,
    body: (note || '') + `<p>${S.week === 0 ? 'The whole Territory has silver fever. Men talk of nothing but ledges, feet, assays and "indications". Everyone owns feet in a mine; nobody, as far as you can tell, owns anything else. Within a week you have it worse than any of them.' : deal(nevFlavor)}</p><p class="where">Living costs $8 a week.</p>`,
    choices: [
      { t: 'Go prospecting', sub: 'pick a district and dig for a ledge', go: () => { prospectMenu(); } },
      { t: 'Trade in mining feet', sub: 'buy and sell shares in the mines', go: () => { market(); } },
      { t: 'Stake a timber claim at Lake Tahoe', sub: 'a week in the woods with Johnny', if: () => !S.flags.tahoe, go: () => { tahoe(); } },
      { t: 'Buy a horse at the auction', if: () => !S.flags.plug, go: () => { plug(); } },
      { t: 'Write a letter to the Territorial Enterprise', sub: `${S.flags.letters || 0} sent so far`, go: () => { writeLetter(); } },
      { t: 'Rest a week in Carson', sub: '+health, +spirits', go: () => { endWeek(1); return `<p>You sit in front of the hotel with your feet on the rail and talk silver with everyone who passes.</p>` + fx({ hp: 10, sp: 6 }); }, next: nevadaWeek },
    ],
  });
}
const nevFlavor = [
  'A man at the hotel shows you a chunk of rock and says it assays at a thousand dollars a ton. You believe him because you want to.',
  'Every man you meet is a millionaire on paper. The paper is the main product of the Territory.',
  'Orion is learning the work of a Secretary, which mostly consists of explaining to Washington why it costs so much.',
  'The Zephyr blew the roof off the hotel kitchen again. The cook served dinner anyway, with dust.',  'A man sells you a map to a lost ledge. It turns out he sells a great many of them.',
  'The assay office has a line out the door. Half the line is carrying the same kind of worthless rock you are.',
  'It snows in the morning and is hot by afternoon. Locals say if you do not like the weather, wait an hour and it will get worse.',
  'A camel train comes through town on the way to the salt marshes. Every horse on the street files a complaint.',
  'Your landlady raises the rent on the grounds that the Territory is booming. You point out that you are not.',
  'Somebody at the hotel is selling feet in a mine that is, he admits under questioning, still mostly a theory.',
];
function feetWorth() { if (!S.mkt) return 0; return Math.round(S.mkt.reduce((s, m) => s + (S.feet[m.name] || 0) * m.p, 0)); }
function endWeek(n) {
  for (let i = 0; i < n; i++) {
    S.week++; S.day += 7; S.money -= 8;
    for (const n of tickMarket()) if (S.feet[n.m.name] > 0) log(n.text);
  }
  if (S.money < 0) { S.sp = clamp(S.sp - 6, 0, 100); }
}

// --- prospecting
const DISTRICTS = {
  humboldt: { name: 'Humboldt', weeks: 3, cost: 40, digs: 9, veins: 2, glitter: 4, value: [600, 4000], text: 'Two hundred miles north-east by wagon, with Ballou the blacksmith and the young Prussians, Ollendorff and the other. The papers say the Humboldt is the richest country on earth.' },
  esmeralda: { name: 'Esmeralda (Aurora)', weeks: 2, cost: 25, digs: 7, veins: 2, glitter: 2, value: [300, 2500], text: 'South to Aurora, where the Wide West is booming and Calvin Higbie, a big honest miner with a cabin, could use a partner.' },
  goldhill: { name: 'Gold Hill pockets', weeks: 1, cost: 8, digs: 5, veins: 1, glitter: 1, value: [80, 500], text: 'A short ride. Small pockets, picked over, but a man might scratch up something.' },
};
function prospectMenu() {
  show({
    title: 'Where to dig?', body: `<p>Prospecting means riding into the hills, looking for "croppings" of quartz, and breaking off samples to see if there is silver inside. It costs money for the outfit and weeks of your life, and pays nothing at all, until suddenly it does.</p>`,
    choices: [
      ...Object.entries(DISTRICTS).map(([k, d]) => ({ t: d.name, sub: `${Math.max(1, d.weeks)} week${Math.max(1, d.weeks) > 1 ? 's' : ''}, outfit ${money(d.cost)}. ${d.text}`, disabled: S.money < d.cost, go: () => { S.money -= d.cost; dig(k); } })),
      { t: '← back to Carson', go: () => { nevadaWeek(); } },
    ],
  });
}
function dig(key) {
  S.loc = key;
  const D = DISTRICTS[key];
  scene.set('mine', {});
  const N = 24, cells = Array.from({ length: N }, () => ({ t: 'rock', dug: false }));
  const idx = [...Array(N).keys()].sort(() => Math.random() - .5);
  let k = 0;
  for (let i = 0; i < D.veins; i++) cells[idx[k++]].t = 'vein';
  for (let i = 0; i < D.glitter; i++) cells[idx[k++]].t = Math.random() < .2 ? 'gold' : 'mica';
  for (let i = 0; i < 4; i++) cells[idx[k++]].t = 'crop';
  // quartz "indications" show around veins before you dig
  const near = i => [i - 1, i + 1, i - 6, i + 6].filter(j => j >= 0 && j < N && (Math.abs((j % 6) - (i % 6)) <= 1));
  cells.forEach((c, i) => { if (c.t === 'vein') near(i).forEach(j => cells[j].q = true); });
  let digs = D.digs, found = [], dust = 0;
  const render = msg => {
    page.innerHTML = `<h2>${D.name}</h2><p class="where">${digs} dig${digs === 1 ? '' : 's'} left. Pale rock is quartz, which is a good sign. Glittering rock glitters.</p>
      ${msg ? `<p>${msg}</p>` : ''}
      <div class="grid">${cells.map((c, i) => `<button class="cell${c.dug ? ' dug' + (c.t === 'vein' ? ' vein' : '') : c.q ? ' q' : (c.t === 'mica' || c.t === 'gold') ? ' g' : ''}" data-i="${i}" ${c.dug || !digs ? 'disabled' : ''} aria-label="rock ${i + 1}">${c.dug ? { rock: '·', crop: '◇', vein: '⛏', mica: '✧', gold: '★' }[c.t] : (c.t === 'mica' || c.t === 'gold') ? '✦' : ''}</button>`).join('')}</div>
      <div class="choices"><button class="btn" id="digDone">${digs ? 'Give up and head home' : 'Pack up and head home →'}</button></div>`;
    page.querySelectorAll('.cell').forEach(b => b.onclick = () => {
      const c = cells[+b.dataset.i]; c.dug = true; digs--; sfx('pick');
      let m;
      if (c.t === 'vein') { const v = ri(...D.value); found.push(v); m = `<b>A ledge!</b> A seam of grey, heavy, silver-bearing quartz runs right through it. Your hands shake as you write out the claim notice.`; sfx('good'); }
      else if (c.t === 'gold') { const v = ri(30, 120); dust += v; m = `Real gold! A few flakes, but real. Worth ${money(v)}.`; }
      else if (c.t === 'mica') { m = pick(['It glitters like a jeweller\'s window. You fill your pockets. Ballou looks at it and says "mica", and throws it away, and you hate him a little.', 'Glittering flakes everywhere! Mica, says the old hand. Worthless. All that glitters, as somebody should have warned you.']); }
      else if (c.t === 'crop') { m = `A cropping of quartz. Promising. Not rich. You keep digging nearby.`; }
      else m = pick(['Country rock. Nothing.', 'Nothing but rock and blisters.', 'Rock. Ordinary, honest, worthless rock.']);
      render(m);
    });
    $('digDone').onclick = () => finishDig(key, found, dust);
  };
  render(`<i>${D.text}</i>`);
}
// `followup` is true when the snowstorm or the blind lead hands control back: the weeks were
// already spent, so it costs no more time.
function finishDig(key, found, dust, followup = false) {
  const D = DISTRICTS[key], weeks = followup ? 0 : Math.max(1, D.weeks);
  endWeek(weeks);
  let html = '';
  const fxs = { money: dust, hp: -4 * weeks, sp: found.length ? 12 : -6 };
  if (!followup && key === 'humboldt' && !S.flags.snow) return snowstorm(found, dust);
  if (!followup && key === 'esmeralda' && !S.flags.blind && Math.random() < .75) return blindLead(found, dust);
  if (found.length) {
    const names = ['the Monarch of the Mountains', 'the Sam Clemens Extension', 'the Lucky Fool', 'the Orion', 'the Sagebrush Queen', 'the Glory of Washoe', 'the Josh', 'the Higbie Hope'].filter(n => !S.mkt.some(m => m.name.toLowerCase() === n));
    const name = names.length ? pick(names) : `the Claim No. ${S.mkt.length}`;
    const val = found.reduce((a, b) => a + b, 0);
    html += `<p>You stake your claim and name it <b>${name}</b>. Back in town, a speculator offers ${money(val)} for your feet. You could also hold them and hope.</p>`;
    page.innerHTML = ''; // replaced by show
    log(`Struck a ledge: ${name}.`);
    return show({ title: 'A claim of your own', body: html + fx(fxs), choices: [
      { t: `Sell for ${money(val)}`, go: () => `<p>You sell. You are rich, for the Territory, for a week or two.</p>` + fx({ money: val, sp: 6 }), next: nevadaWeek },
      { t: 'Hold your feet', sub: 'it joins the market as your own mine', go: () => { const m = { name: name.replace(/^the /, 'The '), p: Math.round(val / 100 * 10) / 10, vol: .45, drift: 0, last: val / 100 }; S.mkt.push(m); S.feet[m.name] = 100; return `<p>You hold. You own a hundred feet of ${m.name}, and are a capitalist.</p>`; }, next: nevadaWeek },
    ] });
  }
  outcome('Home empty-handed', `<p>${weeks ? `${weeks} week${weeks > 1 ? 's' : ''} of digging and you` : 'You'} come home with blisters, sunburn and a sack of samples that make the assayer laugh.</p>` + fx(fxs), nevadaWeek);
}

function snowstorm(found, dust) {
  S.flags.snow = 1; scene.set('snow', {});
  show({
    title: 'Lost in the snow', where: 'Coming home from the Humboldt, with Ballou and Ollendorff',
    body: `<p>On the way back a snowstorm comes down on you so thick you cannot see the horses' ears. Ollendorff, who says he has a compass in his head, leads. After an hour you find a fresh trail in the snow and follow it joyfully. After another hour you notice that it is your own: you have been riding in a circle. Night comes. The snow keeps coming.</p>`,
    choices: [
      { t: 'Light a fire with the last matches', go: () => `<p>Four matches. Each one goes out. Ollendorff tries to light a fire by firing his pistol into a pile of twigs, as he read in a book. The twigs fly away. The horses run off.</p>` + fx({ hp: -10 }) },
      { t: 'Huddle together and wait', go: () => `<p>You lie down in the snow with your companions, and solemnly forgive each other everything, and wait to die.</p>` + fx({ hp: -14 }) },
    ],
  }, () => {
    const vices = ['pipe', 'cards', 'whiskey'].filter(has);
    show({
      title: 'Fifteen steps', body: `<p>You wake at dawn, stiff and alive, and look around. The stage station is <b>fifteen steps away</b>. Its lights were burning all night. You can hear the horses in the stable.</p>
        <p>In the night, expecting death, each of you renounced his vices. Ballou threw away his pack of cards. Ollendorff threw away his bottle. You threw away your pipe.</p>`,
      choices: [
        { t: 'Keep your solemn vow', go: () => { S.vices = false; for (const v of vices) delete S.items[v]; return `<p>You are a reformed man. This lasts, by your count, until breakfast.</p>` + fx({ sp: -10 }); } },
        { t: 'Go and find your pipe in the snow', go: () => `<p>You slip out behind the station to look for it, and find Ballou already there digging for his cards and Ollendorff for his bottle. Nobody says a word about it. Nobody ever does.</p>` + fx({ sp: 10 }) },
      ],
    }, () => { S.flags.snowDone = 1; finishDig('humboldt', found, dust, true); });
  });
}

function blindLead(found, dust) {
  S.flags.blind = 1; scene.set('mine', { cabin: true });
  const extra = found.reduce((a, b) => a + b, 0);
  show({
    title: 'The blind lead', where: 'Esmeralda, with Calvin Higbie',
    body: `<p>Higbie comes into the cabin one night and closes the door very carefully. He has found it: a <b>blind lead</b>, a rich vein hidden inside the Wide West's ground that belongs to nobody yet. By the laws of the district, you and Higbie can claim it; but you must begin work on it within <b>ten days</b> or anyone may take it.</p>
      <p>You file the claim. All night you lie awake and plan your mansion. For ten days you are, on paper, millionaires.</p>
      <p>Then a note: your old friend <b>Captain Nye</b> is lying sick at a ranch nine miles away, and asks for you. And the same day, Higbie rides off to hunt a legendary lost cement mine, leaving you a note to do the work on the claim.</p>`,
    choices: [
      { t: 'Go and nurse Captain Nye', sub: 'what a friend would do', go: () => { log('Nursed Captain Nye. Lost the blind lead.'); return `<p>You nurse the Captain for nine days. He is a terrible patient and you are a worse nurse, and he recovers to spite you. You ride back to the cabin on the tenth day and find a crowd at your claim. Higbie read your note, which said you would do the work; you read his, which said he would. Neither of you did. The claim is "jumped", and your million is gone in a night.</p><p>For the rest of your life you will tell people you were a millionaire for ten days, and it will be perfectly true.</p>` + fx({ sp: 4, hp: -4 }); }, next: () => finishDig('esmeralda', found, dust, true) },
      { t: 'Stay and work the claim', sub: 'what a millionaire would do', go: () => { S.flags.rich = 1; const v = ri(9000, 16000); log(`Kept the blind lead. Sold for ${money(v)}.`); return `<p>You send a doctor to Captain Nye, with your apologies, and you pick up a shovel. On the tenth day the claim is yours by law. A syndicate from San Francisco buys you out for <b>${money(v)}</b>.</p><p>You have done better than the book. The man who wrote it did not.</p>` + fx({ money: v + extra, sp: 25 }); }, next: nevadaWeek },
    ],
  });
}

// --- the market
// `ctx` lets Part II reuse the board: where to go back to, and how a week passes.
function market(msg, ctx = { back: () => nevadaWeek(), wait: () => endWeek(1), label: '← back to Carson' }) {
  scene.set(ctx.scene || 'town', { sign: 'STOCK BOARD' });
  const rows = S.mkt.map((m, i) => {
    const ch = m.p - m.last, own = S.feet[m.name] || 0;
    return `<tr><td>${esc(m.name)}</td><td class="n">${money(m.p * 10).replace('$', '$')}<small>/10ft</small></td><td class="n ${ch > 0 ? 'up' : ch < 0 ? 'dn' : ''}">${ch > 0 ? '▲' : ch < 0 ? '▼' : '·'}${Math.abs(Math.round(ch / (m.last || 1) * 100))}%</td><td class="n">${own}</td>
      <td><button class="btn" data-b="${i}" ${S.money < m.p * 10 ? 'disabled' : ''}>buy</button> <button class="btn" data-s="${i}" ${own < 10 ? 'disabled' : ''}>sell</button></td></tr>`;
  }).join('');
  page.innerHTML = `<h2>The stock board</h2><p class="where">Cash ${money(S.money)} · your feet are worth ${money(feetWorth())}</p>
    ${msg ? `<p>${msg}</p>` : '<p>Everyone in the Territory trades "feet": shares in a mine, measured along its ledge. The big mines on the Comstock are steady. The wildcats are anybody\'s guess, and the guess is usually wrong. Prices move each week.</p>'}
    <table class="mkt"><tr><th>mine</th><th>price</th><th>week</th><th>yours</th><th></th></tr>${rows}</table>
    <div class="choices"><button class="btn" id="mktDone">${ctx.label}</button><button class="btn" id="mktWait">Wait a week and watch the board</button></div>`;
  page.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const m = S.mkt[+b.dataset.b]; S.money -= m.p * 10; S.feet[m.name] = (S.feet[m.name] || 0) + 10; sfx('coin'); hud(); market(`You bought ten feet of ${esc(m.name)}.`, ctx); });
  page.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const m = S.mkt[+b.dataset.s]; S.money += m.p * 10; S.feet[m.name] -= 10; sfx('coin'); hud(); market(`You sold ten feet of ${esc(m.name)}.`, ctx); });
  $('mktDone').onclick = () => ctx.back();
  $('mktWait').onclick = () => { const before = feetWorth(); const hold = ctx.wait(); const after = feetWorth(); hud(); if (checkDeath()) return; if (hold) return ctx.back(); market(`A week goes by. Your feet went from ${money(before)} to ${money(after)}.`, ctx); };
  hud();
}

// --- one-off adventures
function tahoe() {
  S.loc = 'tahoe';
  S.flags.tahoe = 1; scene.set('tahoe', {});
  show({
    title: 'Lake Tahoe', where: 'With Johnny, on foot over the mountains',
    body: `<p>You and a young man called Johnny walk up into the mountains to stake a timber claim on the shore of Lake Tahoe. The lake lies in the pines like a sheet of blue glass, so clear you can see the rocks on the bottom eighty feet down, and seem to float in the air above them. You fence your claim with a few brush piles and call yourselves landowners. You sleep on the sand, fish all day, and feel healthier than you have in your life.</p><p>On the last evening you build a campfire to cook supper, in the dry pine needles near your timber.</p>`,
    choices: [
      { t: 'Clear the needles and bank the fire carefully', go: () => { S.flags.timber = 1; endWeek(1); return `<p>Nothing burns but supper. You leave your timber claim standing, and some weeks later sell it to a sawmill man for <b>$350</b>.</p>` + fx({ money: 350, hp: 15, sp: 15 }); }, next: nevadaWeek },
      { t: 'Light it and go fetch the frying pan', go: () => { endWeek(1); return `<p>You come back to find the fire has run up into the pines. In minutes the whole hillside is a roaring sheet of flame. You and Johnny sit in the boat out on the lake and watch your timber, your fence, your claim and your provisions go up together. It is the most magnificent sight you have ever seen, and it was your fault.</p>` + fx({ hp: 10, sp: 4 }); }, next: nevadaWeek },
    ],
  });
}
function plug() {
  S.flags.plug = 1;
  show({
    title: 'A Genuine Mexican Plug', where: 'The horse auction on the plaza',
    body: `<p>An auctioneer is selling a horse he calls a "Genuine Mexican Plug". A stranger whispers to you that it is the finest horse in the Territory, and that he would buy it himself if he had the money. The bidding stands at $22.</p>`,
    choices: [
      { t: 'Bid $27', if: () => S.money >= 27, go: () => { endWeek(1); return `<p>The Plug is yours. You climb on. It goes straight up into the air with all four feet bunched together, comes down, goes up again, and leaves you on a fence. A crowd gathers to admire the performance. The stranger, it turns out, was the auctioneer's brother. Over the next week the Plug kicks, bites, bucks, and eats your hat. You finally give him away, and the new owner thanks you, which is suspicious.</p>` + fx({ money: -27, hp: -12, sp: 6 }); }, next: nevadaWeek },
      { t: 'Keep your money', go: () => `<p>A newcomer buys him. You watch the horse throw the man onto a roof. You go back to the hotel and feel wise.</p>` + fx({ sp: 4 }), next: nevadaWeek },
    ],
  });
}
function writeLetter() {
  S.flags.letters = (S.flags.letters || 0) + 1;
  endWeek(1);
  const n = S.flags.letters;
  let bonus = (has('notebook') ? 6 : 0) + (S.flags.lies ? 4 : 0) + (has('dictionary') ? 3 : 0);
  const html = `<p>You write a letter to the <i>Territorial Enterprise</i> in Virginia City about ${pick(['the legislature, which you describe as a menagerie', 'the Washoe Zephyr and the donkey it carried off', 'your mining adventures, made only slightly worse than they were', 'a local orator whose speech you summarise as a long low rumble'])}, and sign it "Josh".</p>`
    + `<p>${n === 1 ? 'To your surprise they print it.' : n === 2 ? 'They print it, and people quote it at you in the saloon.' : 'The editor writes back.'}</p>` + fx({ sp: 4 + bonus });
  if (n >= 3 && !S.flags.offer) return outcome('A letter from Virginia City', html, () => reporterOffer('letters'));
  outcome('A letter to the paper', html, nevadaWeek);
}

function reporterOffer(why) {
  S.flags.offer = 1;
  scene.set('city', {});
  show({
    title: 'Twenty-five dollars a week',
    body: `<p>${why === 'forced' ? 'Four months of silver fever have left you with a great many opinions about rock and not much else.' : ''} A letter arrives from the <i>Territorial Enterprise</i>: they want you as city editor and reporter in Virginia City, at <b>$25 a week</b>.</p><p>Twenty-five dollars a week! You had been aiming at a million. But a man can eat on twenty-five dollars, and the mines are not paying you to eat.</p>`,
    choices: [
      { t: 'Take the job', big: true, go: () => { startPaper(); } },
      { t: 'Hang on for one more strike', if: () => why !== 'forced', go: () => `<p>You write back that you will think about it. You do think about it, at night mostly.</p>`, next: () => { S.flags.offer = 0; S.flags.letters = 0; nevadaWeek(); } },
    ],
  });
}

// ---------------------------------------------------------------- ACT 3: the newspaper
const LEADS = [
  { id: 'fanshaw', name: "Buck Fanshaw's funeral", text: 'A great fireman is dead, and his friend Scotty Briggs has gone to arrange things with the new minister. The minister speaks seminary; Scotty speaks Washoe. Neither understands a word the other says.', base: 22, risk: 6 },
  { id: 'petrified', name: 'A petrified man', text: 'Somebody claims to have found a man turned to stone in the desert, sitting up. You could report it straight, or improve on it considerably.', base: 12, risk: 14 },
  { id: 'legis', name: 'The legislature', text: 'The Territorial legislature is in session. It is a bear garden and a circus and very well attended.', base: 10, risk: 12 },
  { id: 'mill', name: 'A quartz mill accident', text: 'A boiler at one of the stamp mills has gone up. Nobody was killed, but a cat was blown clear to the next ward.', base: 10, risk: 4 },
  { id: 'strike', name: 'A new strike on the Comstock', text: 'Every mine on the Comstock wants to be written up. Most of them send a few feet of stock along with the request.', base: 14, risk: 8, pay: true },
  { id: 'zephyr', name: 'The Zephyr strikes again', text: 'The afternoon wind has rearranged the town. Several roofs are now in other counties.', base: 9, risk: 2 },
  { id: 'rival', name: 'The rival editor', text: 'The editor of the Virginia Union has said something about your spelling. Honour demands a reply.', base: 16, risk: 22 },
  { id: 'brawl', name: 'A saloon shooting', text: 'Somebody shot somebody at the bar again. The town is used to it, but readers like the details.', base: 13, risk: 7 },
  { id: 'fire', name: 'The fire companies parade', text: 'Every fire company in town turns out in red shirts and brass. Anybody left out of the write-up will never forgive you.', base: 8, risk: 5 },
  { id: 'ball', name: 'The Sanitary Fund ball', text: 'The ladies of the town are raising money for the war wounded. Write it up with care. Or not.', base: 11, risk: 16 },
];
// The big pool of extra stories lives in leads.js (window.EXTRA_LEADS). Every issue offers four
// you haven't seen: nothing repeats within a run, and across runs the least-recently-seen come first.
const ALL_LEADS = LEADS.concat(window.EXTRA_LEADS || []);
const SEEN_KEY = 'roughing-it-seen-leads';
function drawLeads(n) {
  const used = new Set(S.usedLeads || (S.usedLeads = []));
  let seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  let fresh = ALL_LEADS.filter(l => !used.has(l.id) && !seen.includes(l.id));
  if (fresh.length < n) { seen = []; fresh = ALL_LEADS.filter(l => !used.has(l.id)); }
  const out = fresh.sort(() => Math.random() - .5).slice(0, n);
  for (const l of out) { S.usedLeads.push(l.id); seen.push(l.id); }
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  return out;
}
const PLAIN = ['You report it straight, and the town nods along over its coffee.', 'A sober, accurate paragraph. The editor calls it "respectable", which is not a compliment.', 'Just the facts. Two people read it all the way through, and one of them was you.', 'Plain and true. Nobody is angry, and nobody remembers it by supper.'];
const EMB = [{ k: 'plain', name: 'plain facts', r: 1, t: .5 }, { k: 'stretch', name: 'stretched', r: 1.6, t: 1 }, { k: 'whopper', name: 'a whopper', r: 2.6, t: 2 }];

function startPaper() {
  S.act = 'paper'; S.issue = 0; S.trouble = 0; S.readers = 20 + (S.flags.letters || 0) * 6 + (S.flags.lies || 0) * 3;
  log('Joined the Territorial Enterprise.');
  scene.set('city', {});
  outcome('Virginia City', `<p>Virginia City hangs on the side of Mount Davidson like a town that was thrown there and stuck. Underneath it, the mines go down a thousand feet into hot rock; above it, the saloons, banks, theatres, churches and boarding houses are crowded together on streets so steep that one man's front door looks into his neighbour's chimney. Thirty thousand people and every one of them is in a hurry.</p><p>Your job is to fill a column of local news every day. When there is news, that is easy. When there isn't, the editor says, you will learn.</p>`, paperIssue);
}
function paperIssue() {
  if (S.issue >= 8) return window.partTwo ? partTwo('paper') : ending('paper');
  S.act = 'paper'; scene.set('city', { press: true });
  const leads = drawLeads(4);
  const picks = new Map();
  const render = () => {
    page.innerHTML = `<h2>Issue ${S.issue + 1} of 8</h2><p class="where">Virginia City, ${dateStr()} · choose two stories and how much to improve them</p>
      ${leads.map(l => `<div class="lead${picks.has(l.id) ? ' on' : ''}"><b>${l.name}</b><br>${l.text}<div class="emb">${EMB.map(e => `<button class="btn${picks.get(l.id) === e.k ? ' on' : ''}" data-l="${l.id}" data-e="${e.k}">${e.name}</button>`).join('')}${picks.has(l.id) ? `<button class="btn" data-x="${l.id}">✕ drop</button>` : ''}</div></div>`).join('')}
      <div class="choices"><button class="btn big" id="print" ${picks.size !== 2 ? 'disabled' : ''}>${picks.size === 2 ? 'Send it to press' : `pick ${2 - picks.size} more`}</button></div>`;
    page.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { if (!picks.has(b.dataset.l) && picks.size >= 2) return; picks.set(b.dataset.l, b.dataset.e); sfx('click'); render(); });
    page.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { picks.delete(b.dataset.x); render(); });
    $('print').onclick = () => printIssue(leads, picks);
  };
  render();
}
function printIssue(leads, picks) {
  S.issue++; S.day += 7; S.money += 25;
  let rd = 0, tr = 0, cash = 0, notes = [];
  for (const [id, ek] of picks) {
    const l = leads.find(x => x.id === id), e = EMB.find(x => x.k === ek);
    const r = Math.round(l.base * e.r * rnd(.8, 1.2) * (has('notebook') ? 1.1 : 1));
    let t = Math.round(l.risk * e.t * rnd(.7, 1.3));
    if (l.pay && ek !== 'plain') { const c = ri(30, 90); cash += c; notes.push(`The grateful parties show their gratitude: ${money(c)}, discreetly.`); }
    if (l.s || l.w) notes.push(`<b>${l.name}.</b> ` + (ek === 'whopper' ? l.w : ek === 'stretch' ? l.s : pick(PLAIN)));
    if (id === 'fanshaw') notes.push(ek === 'whopper' ? 'Your account of Scotty and the minister has the whole town repeating Scotty\'s half of the conversation in saloons for a month.' : 'Your funeral piece is gentle and very funny, and Scotty buys you a drink for it.');
    if (id === 'petrified' && ek === 'whopper') { notes.push('In your version the petrified man is thumbing his nose at the reader, if anyone reads closely. Papers back East reprint it as fact. Scientists write in.'); t += 4; }
    if (id === 'rival' && ek !== 'plain') notes.push('The rival editor replies in print that you are a liar, a coward and a poor speller. Only the third is fair.');
    rd += r; tr += t;
  }
  const first = leads.find(x => x.id === [...picks.keys()][0]);
  const head = esc(first.name).toUpperCase();
  const html = `<div class="headline">${head}</div>${notes.map(n => `<p>${n}</p>`).join('') || '<p>The issue goes out and the town reads it at breakfast.</p>'}` + fx({ readers: rd, trouble: tr, money: cash, sp: 3 }) + `<p class="where">+$25 salary</p>`;
  if (S.trouble >= 100 && !S.flags.duel) return outcome('Off the press', html, duel);
  outcome('Off the press', html, paperIssue);
}
function duel() {
  S.flags.duel = 1; scene.set('city', {});
  show({
    title: 'A challenge', body: `<p>A gentleman you have written about too freely sends round a formal challenge to a duel. Dawn, pistols, a ravine outside town. Your friend Steve Gillis, a small man who is a very good shot, offers to be your second and to teach you to shoot in the meantime.</p>`,
    choices: [
      { t: 'Accept, and let Steve do some shooting', go: () => `<p>At dawn you practise on a barn door and hit the county instead. Just as your opponent's party comes over the ridge, Steve shoots the head off a little bird at thirty yards, and tells them you did it. Your opponent, hearing this, finds he has urgent business elsewhere.</p><p>Unfortunately duelling has just been made a prison offence in the Territory, and word gets around. Your friends advise you that San Francisco is very pleasant this time of year.</p>` + fx({ sp: 10, readers: 30 }), next: () => window.partTwo ? partTwo('duel') : ending('duel') },
      { t: 'Print a handsome apology', go: () => `<p>The apology is so handsome that the gentleman is offended all over again, but he cannot quite say why. The matter cools.</p>` + fx({ trouble: -40, readers: -10 }), next: paperIssue },
    ],
  });
}

// ---------------------------------------------------------------- endings
function ending(kind) {
  S.act = 'end';
  const fame = S.readers;
  const total = Math.round(S.money + feetWorth());
  const score = Math.max(0, Math.round(total / 20 + fame + S.hp / 2 + S.sp / 2 + (S.flags.slade ? 20 : 0) + (S.flags.rich ? 50 : 0) + (S.flags.timber ? 10 : 0) + (S.flags.duel ? 20 : 0) + (S.bonus || 0)));
  const titles = {
    laid: ['Sent home to mend', `<p>The West wore you down. A doctor puts you on a stage back East with a bottle of something and strict orders to rest. Orion goes on without you. Years later you still tell the story, but it's a short one.</p>`],
    quit: ['Took the next coach home', `<p>Your heart went out of it. You took the next stage home and spent the rest of your life telling people you had seen the West. Which was true, as far as it went.</p>`],
    paper: ['A writer, by accident', `<p>Eight issues later you have a name in every saloon on the Comstock, and the name is not quite your own. To sign your pieces you have borrowed the old Mississippi leadsman's call for two fathoms of safe water: <b>Mark Twain</b>.</p><p>In time you go on to San Francisco, then to the Sandwich Islands as a correspondent, then onto the lecture stage, and at last you write it all down in a book. You leave out nothing important, and put in a great many things that are better than the truth.</p>`],
    duel: ['Left for San Francisco, in a hurry', `<p>You take the stage over the Sierra that night, with your column, your reputation and your pen name: <b>Mark Twain</b>, the old Mississippi leadsman's call for two fathoms of safe water. San Francisco gives you a newspaper, an earthquake and, eventually, a voyage to the Sandwich Islands. From there it is only a short trip to the lecture stage and a book about roughing it.</p>`],
  };
  Object.assign(titles, window.EXTRA_ENDINGS || {});
  const [tt, txt] = titles[kind];
  const best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  const isBest = !best || score > best.score;
  if (isBest) localStorage.setItem(BEST_KEY, JSON.stringify({ score, title: tt }));
  scene.set(kind === 'lecture' ? 'hall' : kind === 'paper' || kind === 'duel' ? 'sea' : 'plains', { coach: kind === 'laid' || kind === 'quit', applause: kind === 'lecture' });
  sfx(kind === 'laid' || kind === 'quit' ? 'bad' : 'fanfare');
  show({
    title: tt, body: txt + `<table class="mkt">
      <tr><td>Days since St. Joseph</td><td class="n">${S.day}</td></tr>
      <tr><td>Money and mining feet</td><td class="n">${money(total)}</td></tr>
      <tr><td>Readers</td><td class="n">${fame}</td></tr>
      <tr><td>Health / spirits</td><td class="n">${S.hp} / ${S.sp}</td></tr>
      <tr><td>Coffee with Slade · the blind lead · Tahoe timber · a duel</td><td class="n">${S.flags.slade ? '✓' : '–'} ${S.flags.rich ? '✓' : '–'} ${S.flags.timber ? '✓' : '–'} ${S.flags.duel ? '✓' : '–'}</td></tr>
      ${S.feats && S.feats.length ? `<tr><td colspan="2">Also: ${S.feats.join(' · ')}</td></tr>` : ''}
      <tr><td><b>Tale score</b></td><td class="n"><b>${score}</b>${isBest ? ' ★ best' : ''}</td></tr></table>
      <p class="foot">After <i>Roughing It</i> by Mark Twain (1872). The narration here is written for this game; the trip, the people and most of the mishaps are his.</p>`,
    choices: [{ t: 'Start over in St. Louis', big: true, go: () => { title(); } }],
  });
}

// The scene painter lives in art.js (loaded before this file): scene.set(region, opts), scene.roll(ms).

// ---------------------------------------------------------------- sound
let AC = null, muted = localStorage.getItem('roughing-it-mute') === '1';
function audio() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } if (AC && AC.state === 'suspended') AC.resume(); }
function tone(f, d, type = 'triangle', v = .12, when = 0, slide = 0) {
  const t = AC.currentTime + when, o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(gn).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function knock(when, v = .2) {
  const t = AC.currentTime + when, n = AC.sampleRate * .05, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
  f.type = 'lowpass'; f.frequency.value = 700; gn.gain.value = v; s.buffer = b; s.connect(f).connect(gn).connect(AC.destination); s.start(t);
}
// banjo-ish plucks
const pluck = (notes, gap = .09) => notes.forEach((n, i) => { tone(n, .35, 'triangle', .1, i * gap); tone(n * 2, .15, 'square', .02, i * gap); });
function sfx(k, ms) {
  if (muted || !AC) return;
  if (k === 'click') tone(660, .05, 'square', .03);
  else if (k === 'good') pluck([392, 494, 587]);
  else if (k === 'bad') pluck([330, 311, 262], .12);
  else if (k === 'coin') { tone(1320, .08, 'square', .04); tone(1760, .12, 'square', .04, .06); }
  else if (k === 'pick') { knock(0, .35); tone(1900, .06, 'square', .02); }
  else if (k === 'fanfare') pluck([392, 494, 587, 784, 587, 784], .11);
  else if (k === 'clop') { const n = Math.floor((ms || 1500) / 1000 * 8); for (let i = 0; i < n; i++) knock(i * .125 + (i % 2) * .02, i % 2 ? .12 : .18); }
}
$('mute').onclick = () => { muted = !muted; localStorage.setItem('roughing-it-mute', muted ? '1' : '0'); $('mute').textContent = muted ? '♪ sound off' : '♪ sound on'; audio(); };
$('mute').textContent = muted ? '♪ sound off' : '♪ sound on';
$('restart').onclick = () => { if (S.act === 'title' || confirm('Start over from St. Louis?')) title(); };

title();
