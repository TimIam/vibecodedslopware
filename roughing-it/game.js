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
  dictionary: { name: 'Unabridged Dictionary', lb: 12, cost: 0, note: 'Twelve pounds of the English language, unabridged. A comfort on a desk; a battering-ram on a rough road.' },
  pistol: { name: 'Smith & Wesson seven-shooter', lb: 2, cost: 12, note: 'Shoots a ball like a homeopathic pill; it takes the whole seven to make a dose for a grown man.' },
  pipe: { name: 'Pipe & tobacco', lb: 2, cost: 4, note: 'Keeps a man’s spirits up a little every day, like a small salary.' },
  blankets: { name: 'Wool blankets', lb: 6, cost: 6, note: 'The nights in the Rockies are as cold in August as a creditor’s heart.' },
  canteen: { name: 'Canteen', lb: 2, cost: 3, note: 'There is a desert out yonder, and it has heard you are coming.' },
  coat: { name: 'Heavy coat & boots', lb: 7, cost: 15, note: 'Nevada has winters. The emigrant pamphlets are silent on the point.' },
  cards: { name: 'Deck of cards', lb: 1, cost: 1, note: 'For poker at the stations, where the freighters will be powerful glad to see you.' },
  whiskey: { name: 'Jug of whiskey', lb: 4, cost: 3, note: 'Medicinal, according to the jug. Also legal tender west of the Missouri.' },
  notebook: { name: 'Notebook & pencils', lb: 1, cost: 2, note: 'For setting it all down, against the day somebody pays you for it.' },
  medicine: { name: 'Patent medicine', lb: 1, cost: 5, note: 'Cures everything from the ague to melancholy, on the word of the man who bottled it.' },
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
  // on a phone, go back to the top so the scene shows above the new text; on a desktop, just keep the page in view
  if (matchMedia('(max-width:700px), (max-height:500px) and (pointer:coarse)').matches) scrollTo({ top: 0, behavior: 'smooth' }); else page.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    body: `<p>Your brother Orion has been appointed Secretary of the new Nevada Territory, and you have been appointed, by nobody but yourself, his private secretary: an office with no salary and no duties that anybody can name, but with prospects which you consider, after due reflection, to be magnificent.</p>
      <p>You have never been west of the Missouri. You picture buffalo and prairie dogs and antelope, and gold lying about in nuggets to be shovelled up like coal, and yourself coming home to the States in a year or two with a fortune and a carpetbag full of stories. You will be right about the stories.</p>
      <p>Six days up the Missouri by steamboat, a good part of them spent aground on sandbars, brings you to St. Joseph and the Overland stage: <b>1,700 miles</b> to Carson City at about a hundred miles a day, fare $150 a head, paid in advance, as every prudent stage company requires.</p>
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
      body: `<p>The stage company allows each passenger twenty-five pounds of baggage and not an ounce over, and the agent has a scale and a disposition to use it. Your swallow-tail coat, white kid gloves and patent-leather boots must go back to St. Louis on the steamboat. Choose what rides with you. Orion insists on the dictionary; you may overrule him, though it has never yet been done.</p>
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
      ? `<p>The coach is a great swinging and swaying cradle on leather thoroughbraces, drawn by six handsome horses and bound for the sunset. The baggage is in the boot, twenty-seven hundred pounds of mail are piled to the windows inside, and you are on top of it. The driver cracks his whip like a pistol shot, the hostlers let go of the leaders, and away you go.</p>`
      : `<p>${deal(flavor[region])}</p>`,
    choices: [
      { t: 'Ride on', sub: 'a day of travel, about a hundred miles', go: travel },
      { t: S.seat === 'top' ? 'Climb inside onto the mail sacks' : 'Climb up beside the driver', sub: S.seat === 'top' ? 'warmer and safer, and as dull as a sermon' : 'better views and better lies; worse weather', go: () => { S.seat = S.seat === 'top' ? 'inside' : 'top'; stageDay(); } },
      { t: 'Lay over a day at the station', sub: 'rest up (+health, +spirits) for $3 and a day', go: () => { S.day++; return `<p>You let the coach go on without you and slept in a real bunk under a real roof, and the station keeper’s wife fed you saleratus bread, as yellow as gold and very nearly as heavy.</p>` + fx({ hp: 12, sp: 6, money: -3 }); }, next: () => stageDay() },
      { t: 'Take a dose of patent medicine', if: () => has('medicine') && S.hp < 70, go: () => `<p>It tasted of turpentine and good intentions. You felt better at once, possibly from fright.</p>` + fx({ hp: 15, lose: 'medicine' }), next: () => stageDay() },
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
  plains: ['The plains roll off in every direction like a green ocean that has lain down to rest, and the road runs across it in a single dusty seam, as straight as a deacon’s back.', 'Prairie dogs sit up on their mounds and watch the coach go by with the cold, patient look of creditors who know where you board.', 'The sky out here is a considerable sight larger than the one back in Missouri, and it does not appear to have been introduced to you.'],
  bluffs: ['Sandstone bluffs stand up out of the plain like the ruins of a great city that nobody ever got around to building.', 'The North Platte runs alongside, a mile wide and an inch deep, and the colour of station coffee with the milk already in it.'],
  rockies: ['The road climbs, and the air thins and sharpens as it goes, and there is snow on the far peaks in the middle of August, which strikes you as showing off.', 'Sagebrush in every direction, grey-green and knee-high, a forest of little live oaks to anybody who lies down to look at it, and smelling like a patent-medicine shop.', 'The mules are swapped for fresh ones every ten miles or so. Nobody offers to swap the passengers.'],
  salt: ['The valley of the Great Salt Lake opens out below, green and ditched and irrigated, and as tidy as a Presbyterian parlour.'],
  desert: ['Nothing but alkali dust, white and fine as flour, in a man’s eyes and teeth and whiskers, and presently in his religion.', 'The sun bakes the coach like a loaf of saleratus bread, and the horizon trembles in the heat like a man with the ague.'],
  town: ['Carson City is near, the driver says, in the voice of a man who has said it before and been believed.'],
};
const quiet = [
  'It was an uneventful day, if you did not count the jolting and the dust, the heat at noon and the cold at midnight, and the mail sacks, which you had come to know personally, one by one.',
  'You counted sagebrush for an hour and got to four thousand one hundred and eleven, then lost your place and had to begin again at the first bush, which was by then forty miles back.',
  'The driver told you about a man in Julesburg who had been a terror in his day, and you suspected, from the loving detail, that the man was the driver.',
  'It was a long rocking dozing day. You woke each time the coach struck a chuck-hole, which was about every fourth minute, and in between you dreamed of feather beds in the States.',
  'You changed horses at a station every few hours, and each station keeper was shabbier than the last and in better spirits, which you put down to the climate.',
  'Orion read the laws of Nevada Territory aloud from a pamphlet. There were not many laws yet, so he read them twice, with expression.',
  'A passenger snored in a key you had never heard out of any steamboat calliope, and by noon you could hum along.',
  'The mail sacks shifted in the night, and you woke with a letter to a Mrs. Hopkins of Sacramento printed backwards on your cheek.',
  'The driver let you hold the reins for a mile on the flat. The horses knew it at once, the way a schoolroom knows a substitute teacher, and treated you accordingly.',
  'You overtook a train of emigrant wagons creaking along the same road at a tenth of your speed, and waved to them with a great deal of feeling. They did not wave back.',
  'You discovered that a man can sleep sitting up, or lying down, or wedged at a diagonal between two mail sacks, but not well in any of them.',
  'Dinner at the station was beans. Supper was the beans left over from dinner, served with an apology and a little more bacon rind.',
  'A dust devil whirled along beside the coach for three miles like a sociable ghost, and then wandered off across the sagebrush to bother an emigrant.',
  'You tried to write a letter home on your knee, and produced a page that looked as if an earthquake had signed it before witnesses.',
  'At a lonely station a little girl showed you her pet prairie dog, which bit you. She was very proud of it.',
  'The driver pointed out a hill that he said was haunted, and then another, and at last allowed that most of the hills on his division were haunted, and the company made no extra charge for it.',
  'The night was so clear that the stars seemed near enough to rattle when the coach hit a rut.',
];

// Random road events. `if` limits where they can happen; `once` means at most once per trip.
const ROAD = [
  { id: 'dict', once: 1, if: () => has('dictionary') && S.mi > 150, go: daily => show({
    title: 'The dictionary', body: `<p>The coach plunges into a gully and comes up the far side at a run, and everything inside rises into the air together: you, Orion, the mail, the water canteen, and the Unabridged Dictionary, which comes down on you corner-first like the wrath of a schoolmaster. It does this again at the next gully, and the next, and the one after. By noon it has bruised every passenger in the coach and learned nothing.</p>${daily}`,
    choices: [
      { t: 'Pitch it out of the window', go: () => `<p>It landed open in the sagebrush, somewhere about the middle of the letter M, and lay there instructing the coyotes. You felt lighter, and a good deal less educated.</p>` + fx({ sp: 6, lose: 'dictionary' }) },
      { t: 'Keep it; a writer needs words', go: () => `<p>You wedged it under the mail sacks. It got loose twice more before dark and fell on Orion both times, which he bore like a Christian and a brother.</p>` + fx({ hp: -8 }) },
    ] }, stageDay) },
  { id: 'jack', once: 1, if: () => S.mi < 900, go: daily => outcome('A jackass rabbit', `<p>A jackass rabbit with ears like a mule’s sat by the road and considered you. The driver fired a shot near it to show you what it could do, and it laid its ears back and left for the horizon at a gait that would have shamed the telegraph, and was presently a speck, and then a rumour. You had never known a rabbit could express contempt.</p>` + fx({ sp: 8 }) + daily, stageDay) },
  { id: 'coyote', once: 1, go: daily => outcome('A coyote', `<p>A coyote trotted alongside for a mile: a long, slim, sorry-looking skeleton with a tail that apologised for the rest of him. When a town dog from the station came out to chase it, full of self-esteem, the coyote merely loped a little faster, glancing back over his shoulder with a mild interest, until the dog was miles from home in the sagebrush and could not think where all his confidence had gone.</p>` + fx({ sp: 6 }) + daily, stageDay) },
  { id: 'slum', go: daily => show({
    title: 'Station breakfast', body: `<p>At the station the keeper sets out a beverage he calls slumgullion. It pretends to be tea, but there is too much dishrag and sand and old bacon rind in it to deceive the intelligent traveller. Beside it lie a lump of bread and some bacon which the army condemned and the stage company bought cheap.</p>${daily}`,
    choices: [
      { t: 'Eat it all, like a westerner', go: () => Math.random() < .55 ? `<p>It stayed down. You felt you had been initiated into some secret order of the plains.</p>` + fx({ hp: 4, sp: 3 }) : `<p>It did not stay down. You gave it back to the plains, which had the better right to it.</p>` + fx({ hp: -7 }) },
      { t: 'Pay a dollar for the keeper’s private eggs', go: () => `<p>He brought you two eggs, fried by a man who had evidently heard of eggs, and they were worth every cent of the dollar and part of another.</p>` + fx({ money: -1, hp: 6 }) },
      { t: 'Skip it', go: () => `<p>You went hungry, and smug, which is a poor diet but a light one.</p>` + fx({ hp: -3 }) },
    ] }, stageDay) },
  { id: 'brace', go: daily => show({
    title: 'A broken thoroughbrace', body: `<p>With a crack like a rifle shot one of the great leather thoroughbraces the coach swings on gives way, and the whole body sags over on one side like a cow that has decided to lie down and think.</p>${daily}`,
    choices: [
      { t: 'Help the driver mend it', go: () => `<p>It took two hours of rawhide and leverage, and a good deal of profanity, which you supplied. The driver said you swore like a natural-born mule-skinner, and you took it kindly.</p>` + fx({ sp: 4, hp: -3 }) },
      { t: 'Sit in the shade and offer advice', go: () => `<p>It took the rest of the day. You gave a great deal of advice, all of it free, and it was valued at exactly that.</p>` + fx({ day: 1, sp: -2 }) },
    ] }, stageDay) },
  { id: 'poker', if: () => has('cards'), go: daily => show({
    title: 'A game at the station', body: `<p>A pair of freighters at the station have a table, a tallow candle, a greasy deck and an expression of great innocence, and they let it be known that they would welcome a friendly hand, for small stakes, among gentlemen.</p>${daily}`,
    choices: [
      { t: 'Play for $10', if: () => S.money >= 10, go: () => Math.random() < .45 ? `<p>You won, which surprised everybody at the table, and you most of all.</p>` + fx({ money: ri(14, 30), sp: 6 }) : `<p>Their innocence, you learned, was a thing they put on for strangers, like a Sunday coat.</p>` + fx({ money: -10, sp: -4 }) },
      { t: 'Decline politely', go: () => `<p>They looked as hurt as two deacons passed over at the collection. You kept your money.</p>` },
    ] }, stageDay) },
  { id: 'storm', if: () => S.mi < 1100, go: daily => outcome('Thunderstorm', S.seat === 'top'
    ? `<p>A storm came over the plain in a black wall and broke right on top of you. Up on the box there was nowhere to go, and the lightning was close enough to read a newspaper by, if you had had a dry one. You reached the next station soaked to the marrow and greatly impressed.</p>` + fx({ hp: -9, sp: 3 }) + daily
    : `<p>A storm rolled over the plain. Snug inside among the mail sacks, you watched the lightning walk across the prairie on legs of fire, and it was a finer show than any circus that ever came to Hannibal, and nobody passed the hat.</p>` + fx({ sp: 6 }) + daily, stageDay) },
  { id: 'liar', if: () => S.seat === 'top', go: daily => outcome('The driver talks', `<p>The driver pointed with his whip to a hill where, he said, he had once outrun a band of road agents with the mules on fire and the mail sacks singing the Doxology. You believed every word of it, and it came to you that this was the right way to tell a story: perfectly grave, with no expression at all, and a size or two larger than the facts.</p>` + fx({ sp: 9 }) + (has('notebook') ? '<p>You wrote it all down that night, and improved it.</p>' : '') + daily + ((S.flags.lies = (S.flags.lies || 0) + 1), ''), stageDay) },
  { id: 'buffalo', once: 1, if: () => S.mi > 200 && S.mi < 700, go: daily => outcome('Bemis and the buffalo', `<p>At the station a fellow passenger named Bemis came back from a buffalo hunt with his clothes in ribbons and his dignity in worse repair. The bull had chased him, he said, and he had climbed a tree, and the bull had climbed up after him. Somebody remarked that a buffalo cannot climb a tree. Bemis said that ordinarily it could not, but this one was so powerful mad it would have climbed a liberty pole. He looked around the table for anybody disposed to argue, and found nobody.</p>` + fx({ sp: 10 }) + daily, stageDay) },
  { id: 'river', if: () => S.mi < 1100, go: daily => show({
    title: 'High water at the crossing', body: `<p>The river ahead is up and running fast and brown, with whole cottonwoods going by in it. The driver looks at the river, and then at the passengers, and offers you the choice like a hostess offering a second helping of something she cooked herself.</p>${daily}`,
    choices: [
      { t: 'Ford it now', go: () => Math.random() < .7 ? `<p>The coach floated for one terrible moment, like a steamboat with no pilot, and then the wheels found the bottom again. Everybody cheered, including the mules.</p>` + fx({ sp: 5 }) : `<p>The coach lurched and emptied half its passengers into the river. You were fished out a quarter of a mile downstream, with a quart and a half of the river inside you.</p>` + fx({ hp: -10, lose: pick(Object.keys(S.items)) }) },
      { t: 'Wait for the water to drop', go: () => `<p>You waited a day on the bank. The river went down, and so did your spirits, at about the same rate.</p>` + fx({ day: 1, sp: -4, hp: 3 }) },
    ] }, stageDay) },
  { id: 'agents', if: () => S.mi > 400, go: daily => show({
    title: 'Rumours of road agents', body: `<p>At the station there is talk that road agents have been stopping coaches on this stretch, and the other passengers begin hiding their money in their boots and their hats and the linings of their coats, and one man in his Bible, which he says no road agent will ever open.</p>${daily}`,
    choices: [
      { t: 'Keep your seven-shooter in your lap', if: () => has('pistol'), go: () => `<p>Nothing happened. You concluded that your pistol had frightened them off, and nobody has ever been able to prove otherwise.</p>` + fx({ sp: 6 }) },
      { t: 'Hide your money in the dictionary', if: () => has('dictionary'), go: () => `<p>You put it under "Q", reasoning that no road agent in the Territory would ever look under Q, and you were right.</p>` + fx({ sp: 4 }) },
      { t: 'Sit tight and worry', go: () => Math.random() < .25 ? `<p>Two men with flour sacks over their heads stopped the coach at dusk. They were as polite as bank clerks and a good deal quicker, and were gone into the sagebrush with part of your money before you had properly made their acquaintance.</p>` + fx({ money: -Math.min(S.money, ri(20, 60)), sp: -8 }) : `<p>Nothing happened, though you lay awake the whole night making sure of it.</p>` + fx({ hp: -3 }) },
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
  pony: daily => { scene.set('plains', { coach: true, pony: true }); outcome('The Pony Express!', `<p>Near Fort Kearney the driver sang out, "Here he comes!" Far off across the dead level of the plain a black speck appeared, and grew, and turned into a horse and rider rising and falling and coming on like a shot out of a gun; then there was a drumming of hoofs and a wave of the hand, and he went past in a gust of wind with the mail pouch bouncing behind him. In a minute he was a speck again, and then nothing at all. The whole affair lasted about as long as a sneeze, and you would not have missed it for twice the fare.</p>` + fx({ sp: 14 }) + daily, stageDay); },
  mudwagon: daily => show({
    title: 'Julesburg: change of coaches', where: 'Overland City, also called Julesburg',
    body: `<p>At Julesburg your fine Concord coach is swapped for a "mud-wagon", a cheaper and harder rig built on the principle that a passenger is a kind of mail that complains. There is less room, and the agent eyes your baggage with a fresh and personal suspicion. The mail must go through; the passengers may go through if there is space.</p>${daily}`,
    choices: [
      { t: 'Argue for your things', go: () => Math.random() < .5 ? `<p>You won the argument by the simple method of never once stopping talking, until the agent gave up and went to talk to the mules, who listened better.</p>` + fx({ sp: 4 }) : `<p>The agent won it by the simpler method of throwing something off.</p>` + fx({ lose: pick(Object.keys(S.items)), sp: -4 }) },
      { t: 'Bribe the agent with whiskey', if: () => has('whiskey'), go: () => `<p>The agent took one long pull at the jug and found that your baggage weighed nothing whatever.</p>` + fx({ lose: 'whiskey', sp: 3 }) },
    ] }, stageDay),
  bluffs: daily => outcome("Scott's Bluffs", `<p>The bluffs rose from the plain like a fortress, and the driver told you that a man had died beneath them, years ago, sick and abandoned by his party, and that he had crawled sixty miles to get there before he gave it up. He told it the way he told everything, as if it were the weather or the price of hay.</p><p>You looked back at the bluffs for a long while after, and did not say much until the next station.</p>` + fx({ sp: 2 }) + daily, stageDay),
  slade: daily => { scene.set('rockies', { station: true }); show({
    title: 'Breakfast with Slade', where: 'Rocky Ridge station, in the Rocky Mountains',
    body: `<p>For a week the drivers and conductors have talked of nothing but Slade, the division agent: a man said to have killed twenty-six men, some of them for very little and one or two for less. You have pictured him as something between a grizzly and a giant, with horns.</p><p>At Rocky Ridge you sit down to breakfast, and the mild, soft-spoken gentleman at the head of the table, the one who passes the bacon so courteously, is Slade. There is one cup of coffee left in the pot, and he offers it to you.</p>${daily}`,
    choices: [
      { t: 'Politely decline. After you, sir.', go: () => { S.flags.slade = 1; return `<p>He insisted, and filled your cup with his own hand, and you drank it under the eye of the most celebrated desperado on the Overland road. You left the table rather more alive than you had expected to, and powerful anxious not to have offended him by anything you had said or failed to say.</p>` + fx({ sp: 10 }); } },
      { t: 'Accept with thanks', go: () => { S.flags.slade = 1; return `<p>You drank it, and he smiled, and passed the sugar. You spent years afterward wondering whether you had ever been in any real danger, and told the story at every dinner table you sat down to for the rest of your life, a little larger each time.</p>` + fx({ sp: 8 }); } },
      { t: 'Ask him about the twenty-six men', go: () => (S.flags.slade = 1) && `<p>The table went as still as a church before the collection. Slade considered you for a long moment, then laughed, and passed you the bacon. Orion kicked you under the table hard enough to raise a lump the size of a hen’s egg.</p>` + fx({ hp: -4, sp: 12 }) },
    ] }, stageDay); },
  southpass: daily => outcome('South Pass', `<p>You crossed the backbone of the continent so easily you would never have known it, by a broad grassy saddle with a few patches of old snow lying about; from there on, every creek you met was bound for the Pacific. In the night the cold came down off the peaks like a falling wall.</p>` + (has('blankets') ? `<p>You were never so glad of anything as of your blankets.</p>` + fx({ sp: 5 }) : `<p>You had no blankets, and spent the night burrowed into the mail like a gopher, shivering in time with the coach.</p>` + fx({ hp: -10 })) + daily, stageDay),
  greenriver: daily => show({
    title: 'Green River', body: `<p>At Green River station there is a lame mule that needs shooting, and nobody cares to do it, and somebody remembers that you have a pistol.</p>${daily}`,
    choices: [
      { t: 'Show them your seven-shooter', if: () => has('pistol'), go: () => `<p>You aimed with great care, and the ball went somewhere in Utah Territory. The mule looked around with a faint, polite interest. The station keeper took the pistol away from you as tenderly as if you had been a child with a carving knife, and did the job with his own.</p>` + fx({ sp: -3 }) },
      { t: 'Stay out of it', go: () => `<p>You went down and admired the river instead. It was green, uncommon green, and you thought it handsome of the West to have named one thing on the square.</p>` + fx({ sp: 3 }) },
    ] }, stageDay),
  saltlake: daily => { scene.set('salt', { coach: true }); show({
    title: 'Great Salt Lake City', where: 'Two days in the City of the Saints',
    body: `<p>After weeks of sagebrush, Salt Lake City is a marvel: broad streets with clear mountain water running down the gutters, orchards, neat adobe houses, and an air of having been built by people who meant it and expected to stay. The stage lays over two days.</p>${daily}`,
    choices: [
      { t: 'Call on Brigham Young with Orion', go: () => `<p>The great man was calm and kindly, and talked with Orion about everything under the sun except what Orion had come to talk about, and never once looked at you. When you rose to leave he laid a fatherly hand on your head and asked Orion whether this was his child, and whether it was a boy or a girl. You were twenty-five years old and wore a moustache. You decided not to bring it up.</p>` + fx({ sp: 10, day: 2 }) },
      { t: 'Try the local "valley tan" whiskey', go: () => `<p>It was said to be made of fire and brimstone imported for the purpose. After one swallow you were in no position to dispute it.</p>` + fx({ sp: 12, hp: -6, day: 2 }) },
      { t: 'Rest, eat, and buy a canteen', sub: '$5', if: () => S.money >= 5, go: () => `<p>You had two full nights’ sleep and real meals at a real table. You bought a canteen, because a driver had said "the desert" in a tone of voice you did not like.</p>` + fx({ hp: 16, sp: 4, money: -5, gain: 'canteen', day: 2 }) },
    ] }, stageDay); },
  alkali: daily => { scene.set('desert', { coach: true }); show({
    title: 'The alkali desert', where: 'Forty-odd miles without water',
    body: `<p>You had thought a desert would be romantic, with caravans of camels and shimmering sands out of the Arabian Nights. It is nothing of the kind. It is forty miles of white alkali dust under a sun like a shovelful of live coals, and the dust rises in a fine cloud that gets into everything a man owns, including his opinions.</p>${daily}`,
    choices: [
      { t: 'Ration the canteen', if: () => has('canteen'), go: () => `<p>You took it sip by sip and mile by mile, and came out at the far end cracked and white as a miller, but on your own feet.</p>` + fx({ hp: -5 }) },
      { t: 'Share the canteen with the mules', if: () => has('canteen'), go: () => `<p>The mules were grateful in the way mules are grateful, which is to say not so you would notice. But they kept moving, and so did you.</p>` + fx({ hp: -9, sp: 8 }) },
      { t: 'Endure it', go: () => `<p>By the end you had no spit and no voice left, and not one particle of romance about deserts, which you have never got back.</p>` + fx({ hp: has('canteen') ? -8 : -20, sp: -6 }) },
    ] }, stageDay); },
  carson: () => arriveCarson(),
};

function arriveCarson() {
  scene.set('town', { sign: 'CARSON CITY', wind: true });
  const late = S.day > 24;
  const html = `<p>On the twentieth day or thereabouts a wooden town of little white frame houses came up out of the dust. Carson City! Before you could get a good look at it, the afternoon <b>Washoe Zephyr</b> arrived: a wind that took the town up by its loose parts and threw them about. Hats went by, and shingles and tin cans and blankets, and dogs and a donkey, all at a respectable height and in no hurry to come down. The citizens told you that when a stranger first sees the Zephyr he either goes home on the next stage or stays for life.</p>
    ${late ? `<p>You were ${S.day - 20} days behind the timetable, and Orion was sworn in only after an anxious week of telegrams to Washington.</p>` : '<p>Orion was sworn in as Secretary at once, and you became private secretary to a man with no office and no desk, at a salary of nothing a year, paid promptly.</p>'}`
    + fx({ sp: late ? -5 : 8 });
  outcome('Carson City', html, () => show({
    title: 'Stay or go?', body: `<p>A wind like that asks a man a question, and expects an answer before the next stage leaves.</p>`,
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
    else if (Math.random() < .05 && m.p < 30) { r = .15; news.push({ m, text: `${m.name}: the ledge has "pinched out", and the feet are worth about what the paper is, or a little less.` }); }
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
    body: (note || '') + `<p>${S.week === 0 ? 'The whole Territory has the silver fever. Men talk of nothing but ledges and feet and assays and "indications", and every man you meet owns feet in a mine; nobody, so far as you can discover, owns anything else. Within a week you have it worse than any of them, and are calculating your fortune on the backs of envelopes.' : deal(nevFlavor)}</p><p class="where">Board and lodging run $8 a week, in advance.</p>`,
    choices: [
      { t: 'Go prospecting', sub: 'pick a district and dig for a ledge', go: () => { prospectMenu(); } },
      { t: 'Trade in mining feet', sub: 'buy and sell shares in the mines', go: () => { market(); } },
      { t: 'Stake a timber claim at Lake Tahoe', sub: 'a week in the woods with Johnny', if: () => !S.flags.tahoe, go: () => { tahoe(); } },
      { t: 'Buy a horse at the auction', if: () => !S.flags.plug, go: () => { plug(); } },
      { t: 'Write a letter to the Territorial Enterprise', sub: `${S.flags.letters || 0} sent so far`, go: () => { writeLetter(); } },
      { t: 'Rest a week in Carson', sub: '+health, +spirits', go: () => { endWeek(1); return `<p>You sat in front of the hotel for a week with your boots on the rail, and talked silver with every man who passed, and were tolerably rich by Saturday on the strength of conversation alone.</p>` + fx({ hp: 10, sp: 6 }); }, next: nevadaWeek },
    ],
  });
}
const nevFlavor = [
  'A man at the hotel shows you a chunk of rock and says it assays at a thousand dollars a ton. You believe him, because you want to, which is how most of the believing in Washoe is done.',
  'Every man you meet is a millionaire on paper, and paper is the chief product of the Territory, after dust and lawsuits.',
  'Orion is learning the duties of a Secretary, which consist mainly of explaining to the Comptroller in Washington why a pocket knife cost three dollars.',
  'The Zephyr has taken the roof off the hotel kitchen again. The cook served dinner anyway, seasoned with about a teaspoonful of Washoe to the plate.',  'A man sells you a map to a lost ledge for four bits, and you learn afterward that he does a brisk trade in them and has sold the same ledge to half of Carson.',
  'The assay office has a line out the door and halfway down the block, and half the line is carrying the same kind of worthless rock you are, with the same expression.',
  'It snows in the morning and is hot by afternoon. The old residents say that if you do not like the weather you need only wait an hour, and it will be worse.',
  'A camel train comes through town on its way to the salt marshes, and every horse on the street files a formal complaint, and two of them leave for California.',
  'Your landlady raises the rent on the grounds that the Territory is booming. You point out, with dignity, that you are not.',
  'A man at the hotel is selling feet in a wildcat mine which is, he admits under cross-examination, still mostly a theory and partly a hole.',
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
  humboldt: { name: 'Humboldt', weeks: 3, cost: 40, digs: 9, veins: 2, glitter: 4, value: [600, 4000], text: 'Two hundred miles north-east by wagon, with Mr. Ballou the blacksmith and the young Prussians, Ollendorff and the other. The newspapers say the Humboldt is the richest country on the face of the earth, and the newspapers own feet there.' },
  esmeralda: { name: 'Esmeralda (Aurora)', weeks: 2, cost: 25, digs: 7, veins: 2, glitter: 2, value: [300, 2500], text: 'South to Aurora, where the Wide West is booming, and where Calvin Higbie, a big, honest, good-natured miner with a cabin and no partner, is in the market for one.' },
  goldhill: { name: 'Gold Hill pockets', weeks: 1, cost: 8, digs: 5, veins: 1, glitter: 1, value: [80, 500], text: 'A short ride. The pockets are small and picked over by every pilgrim on the Comstock, but a man might scratch up two bits’ worth.' },
};
function prospectMenu() {
  show({
    title: 'Where to dig?', body: `<p>Prospecting means riding into the hills, hunting for "croppings" of quartz, and knocking off samples with a hammer to see whether there is silver inside. It costs money for the outfit and weeks out of your life, and it pays nothing whatever, week after week, until all of a sudden it pays everything.</p>`,
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
    page.innerHTML = `<h2>${D.name}</h2><p class="where">${digs} dig${digs === 1 ? '' : 's'} left. Pale rock is quartz, which is an indication. Glittering rock glitters, and that is all it has ever been known to do.</p>
      ${msg ? `<p>${msg}</p>` : ''}
      <div class="grid">${cells.map((c, i) => `<button class="cell${c.dug ? ' dug' + (c.t === 'vein' ? ' vein' : '') : c.q ? ' q' : (c.t === 'mica' || c.t === 'gold') ? ' g' : ''}" data-i="${i}" ${c.dug || !digs ? 'disabled' : ''} aria-label="rock ${i + 1}">${c.dug ? { rock: '·', crop: '◇', vein: '⛏', mica: '✧', gold: '★' }[c.t] : (c.t === 'mica' || c.t === 'gold') ? '✦' : ''}</button>`).join('')}</div>
      <div class="choices"><button class="btn" id="digDone">${digs ? 'Give up and head home' : 'Pack up and head home →'}</button></div>`;
    page.querySelectorAll('.cell').forEach(b => b.onclick = () => {
      const c = cells[+b.dataset.i]; c.dug = true; digs--; sfx('pick');
      let m;
      if (c.t === 'vein') { const v = ri(...D.value); found.push(v); m = `<b>A ledge!</b> A seam of grey, heavy, silver-bearing quartz ran clean through the rock. Your hands shook so that you spoiled two notices before you got the claim written out fair.`; sfx('good'); }
      else if (c.t === 'gold') { const v = ri(30, 120); dust += v; m = `Real gold! Only a few flakes, but real, and worth ${money(v)} at the assay office.`; }
      else if (c.t === 'mica') { m = pick(['It glittered like a jeweller’s window, and you filled your pockets with it. Ballou looked at it and said "mica", and threw it away, and you hated him for the better part of an afternoon.', 'Glittering flakes everywhere! Mica, said the old hand, and worthless. All that glitters, as your Sunday-school teacher could have told you, and very likely did.']); }
      else if (c.t === 'crop') { m = `A cropping of quartz, promising but not rich. You kept digging close by, the way a man keeps feeling in a pocket he has already searched.`; }
      else m = pick(['Country rock, and nothing in it.', 'Nothing but rock and blisters, in about equal amounts.', 'Rock: plain, honest, worthless rock, such as the Territory has more of than any country on earth.']);
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
    html += `<p>You staked your claim and named it <b>${name}</b>. Back in town a speculator in a stovepipe hat offered you ${money(val)} for your feet, cash down. You might also hold them and hope, which is cheaper, and has been known to pay.</p>`;
    page.innerHTML = ''; // replaced by show
    log(`Struck a ledge: ${name}.`);
    return show({ title: 'A claim of your own', body: html + fx(fxs), choices: [
      { t: `Sell for ${money(val)}`, go: () => `<p>You sold, and were rich, as riches go in the Territory, for a week or two.</p>` + fx({ money: val, sp: 6 }), next: nevadaWeek },
      { t: 'Hold your feet', sub: 'it joins the market as your own mine', go: () => { const m = { name: name.replace(/^the /, 'The '), p: Math.round(val / 100 * 10) / 10, vol: .45, drift: 0, last: val / 100 }; S.mkt.push(m); S.feet[m.name] = 100; return `<p>You held. You owned a hundred feet of ${m.name}, and were a capitalist, and began to look at speculators with a cold eye.</p>`; }, next: nevadaWeek },
    ] });
  }
  outcome('Home empty-handed', `<p>${weeks ? `${weeks} week${weeks > 1 ? 's' : ''} of digging and you` : 'You'} came home with blisters and a sunburn and a sack of samples that made the assayer laugh until he had to sit down.</p>` + fx(fxs), nevadaWeek);
}

function snowstorm(found, dust) {
  S.flags.snow = 1; scene.set('snow', {});
  show({
    title: 'Lost in the snow', where: 'Coming home from the Humboldt, with Ballou and Ollendorff',
    body: `<p>On the way back a snowstorm comes down on you so thick you cannot see the horses’ ears. Ollendorff, who says he has a compass in his head as sure as any Mississippi pilot’s, takes the lead. After an hour you strike a fresh trail in the snow and follow it joyfully, and after another hour you notice that it is your own, and that you have been riding in a circle with great energy. Night comes on, and the snow keeps coming.</p>`,
    choices: [
      { t: 'Light a fire with the last matches', go: () => `<p>There were four matches, and each one went out. Ollendorff tried to light a fire by firing his pistol into a pile of twigs, as he had read of its being done in a book; the twigs flew off into the dark, and the horses, taking the hint, went after them.</p>` + fx({ hp: -10 }) },
      { t: 'Huddle together and wait', go: () => `<p>You lay down in the snow with your companions, and you all solemnly forgave each other everything you could remember, and some things you could not, and composed yourselves to die.</p>` + fx({ hp: -14 }) },
    ],
  }, () => {
    const vices = ['pipe', 'cards', 'whiskey'].filter(has);
    show({
      title: 'Fifteen steps', body: `<p>You woke at dawn, stiff and astonished to be alive, and looked about you. The stage station stood <b>fifteen steps away</b>. Its lights had been burning all night, and you could hear the horses stamping in the stable.</p>
        <p>In the night, expecting death, each of you had renounced his vices for good: Ballou had thrown away his pack of cards, and Ollendorff his bottle, and you your pipe, with speeches.</p>`,
      choices: [
        { t: 'Keep your solemn vow', go: () => { S.vices = false; for (const v of vices) delete S.items[v]; return `<p>You were a reformed man. It lasted, by your own count, until a little after breakfast.</p>` + fx({ sp: -10 }); } },
        { t: 'Go and find your pipe in the snow', go: () => `<p>You slipped out behind the station to look for it, and found Ballou already there digging for his cards, and Ollendorff for his bottle. Nobody said a word about it then, and nobody has mentioned it since.</p>` + fx({ sp: 10 }) },
      ],
    }, () => { S.flags.snowDone = 1; finishDig('humboldt', found, dust, true); });
  });
}

function blindLead(found, dust) {
  S.flags.blind = 1; scene.set('mine', { cabin: true });
  const extra = found.reduce((a, b) => a + b, 0);
  show({
    title: 'The blind lead', where: 'Esmeralda, with Calvin Higbie',
    body: `<p>Higbie comes into the cabin one night and shuts the door behind him very carefully, and stands there, pale. He has found it: a <b>blind lead</b>, a rich vein hidden inside the Wide West’s ground that belongs to nobody yet. By the laws of the district you and Higbie may claim it, but you must begin work on it within <b>ten days</b> or any man may take it.</p>
      <p>You file the claim. All night you lie awake and plan your mansion, with a billiard room and a brownstone front and a trip to Europe afterward. For ten days you are, on paper, millionaires.</p>
      <p>Then a note comes: your old friend <b>Captain Nye</b> is lying sick at a ranch nine miles off, and asks for you. The same day Higbie rides off to hunt the Whiteman cement mine, a legendary affair nobody has ever found twice, leaving you a note to do the work on the claim.</p>`,
    choices: [
      { t: 'Go and nurse Captain Nye', sub: 'what a friend would do', go: () => { log('Nursed Captain Nye. Lost the blind lead.'); return `<p>You nursed the Captain for nine days. He was a terrible patient and you were a worse nurse, and he got well, as near as you could judge, out of pure spite. You rode back to the cabin on the tenth day and found a crowd at your claim. Higbie had left you a note to do the work, and you had left him one to do it, and each of you, reading the other’s, had considered the matter in good hands. Neither of you lifted a pick. The claim was "jumped", and your million was gone in a night, like a circus leaving town.</p><p>For the rest of your life you told people you had been a millionaire for ten days, and it was perfectly true.</p>` + fx({ sp: 4, hp: -4 }); }, next: () => finishDig('esmeralda', found, dust, true) },
      { t: 'Stay and work the claim', sub: 'what a millionaire would do', go: () => { S.flags.rich = 1; const v = ri(9000, 16000); log(`Kept the blind lead. Sold for ${money(v)}.`); return `<p>You sent a doctor to Captain Nye with your compliments and apologies, and you picked up a shovel. On the tenth day the claim was yours by law, and a syndicate of San Francisco capitalists in stovepipe hats bought you out for <b>${money(v)}</b>.</p><p>You had done better than the book. The man who wrote it did not.</p>` + fx({ money: v + extra, sp: 25 }); }, next: nevadaWeek },
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
    ${msg ? `<p>${msg}</p>` : '<p>Everybody in the Territory trades in "feet": shares in a mine, measured by the foot along its ledge. The big mines on the Comstock are as steady as a deacon. The wildcats are anybody’s guess, and the guess is generally wrong. Prices move every week, mostly on talk.</p>'}
    <table class="mkt"><tr><th>mine</th><th>price</th><th>week</th><th>yours</th><th></th></tr>${rows}</table>
    <div class="choices"><button class="btn" id="mktDone">${ctx.label}</button><button class="btn" id="mktWait">Wait a week and watch the board</button></div>`;
  page.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const m = S.mkt[+b.dataset.b]; S.money -= m.p * 10; S.feet[m.name] = (S.feet[m.name] || 0) + 10; sfx('coin'); hud(); market(`You bought ten feet of ${esc(m.name)}.`, ctx); });
  page.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const m = S.mkt[+b.dataset.s]; S.money += m.p * 10; S.feet[m.name] -= 10; sfx('coin'); hud(); market(`You sold ten feet of ${esc(m.name)}.`, ctx); });
  $('mktDone').onclick = () => ctx.back();
  $('mktWait').onclick = () => { const before = feetWorth(); const hold = ctx.wait(); const after = feetWorth(); hud(); if (checkDeath()) return; if (hold) return ctx.back(); market(`A week went by. Your feet went from ${money(before)} to ${money(after)}.`, ctx); };
  hud();
}

// --- one-off adventures
function tahoe() {
  S.loc = 'tahoe';
  S.flags.tahoe = 1; scene.set('tahoe', {});
  show({
    title: 'Lake Tahoe', where: 'With Johnny, on foot over the mountains',
    body: `<p>You and a young man called Johnny walk up over the mountains to stake a timber claim on the shore of Lake Tahoe. The lake lies in the pines like a sheet of blue glass, so clear that you can see the rocks on the bottom eighty feet down, and seem, in the boat, to be floating in the air above them. You fence your claim with a few brush piles and call yourselves landowners. You sleep on the sand and fish all day, and feel healthier than you have since you were ten years old.</p><p>On the last evening you build a campfire to cook supper, among the dry pine needles close by your timber.</p>`,
    choices: [
      { t: 'Clear the needles and bank the fire carefully', go: () => { S.flags.timber = 1; endWeek(1); return `<p>Nothing burned but supper. You left your timber claim standing, and some weeks later sold it to a sawmill man for <b>$350</b>, and have regarded yourself ever since as a lumber baron in a small way.</p>` + fx({ money: 350, hp: 15, sp: 15 }); }, next: nevadaWeek },
      { t: 'Light it and go fetch the frying pan', go: () => { endWeek(1); return `<p>You came back to find the fire had run up into the pines, and in a few minutes the whole mountainside was one roaring sheet of flame. You and Johnny sat in the boat out on the lake and watched your timber and your fence and your provisions go up together, with your claim on top. It was the most magnificent sight you had ever seen, and it was entirely your own doing.</p>` + fx({ hp: 10, sp: 4 }); }, next: nevadaWeek },
    ],
  });
}
function plug() {
  S.flags.plug = 1;
  show({
    title: 'A Genuine Mexican Plug', where: 'The horse auction on the plaza',
    body: `<p>An auctioneer on the plaza is selling a horse he calls a "Genuine Mexican Plug", and a stranger at your elbow whispers that it is the finest horse in the Territory, and that he would buy it himself this minute if he had the money about him. The bidding stands at $22.</p>`,
    choices: [
      { t: 'Bid $27', if: () => S.money >= 27, go: () => { endWeek(1); return `<p>The Plug was yours. You climbed on, and he went straight up into the air with all four feet bunched together, came down, went up again, and left you astride a fence. A crowd gathered to admire the performance and offer opinions. The stranger, you learned, was the auctioneer’s brother. Over the following week the Plug kicked and bit and bucked, and ate the better part of your hat. You finally gave him away, and the new owner thanked you, which you considered suspicious.</p>` + fx({ money: -27, hp: -12, sp: 6 }); }, next: nevadaWeek },
      { t: 'Keep your money', go: () => `<p>A newcomer from the States bought him, and you watched the horse put the man on the roof of a livery stable. You went back to the hotel and felt wise for the rest of the day.</p>` + fx({ sp: 4 }), next: nevadaWeek },
    ],
  });
}
function writeLetter() {
  S.flags.letters = (S.flags.letters || 0) + 1;
  endWeek(1);
  const n = S.flags.letters;
  let bonus = (has('notebook') ? 6 : 0) + (S.flags.lies ? 4 : 0) + (has('dictionary') ? 3 : 0);
  const html = `<p>You wrote a letter to the <i>Territorial Enterprise</i> in Virginia City about ${pick(['the legislature, which you described as a menagerie with the cages left open', 'the Washoe Zephyr, and a donkey it carried off toward Utah', 'your mining adventures, made only a little worse than they were', 'a local orator whose two-hour speech you reported in full as a long low rumble'])}, and signed it "Josh".</p>`
    + `<p>${n === 1 ? 'To your astonishment they printed it.' : n === 2 ? 'They printed it, and men you had never met quoted it back at you across the bar.' : 'The editor wrote back, on the paper’s own letterhead.'}</p>` + fx({ sp: 4 + bonus });
  if (n >= 3 && !S.flags.offer) return outcome('A letter from Virginia City', html, () => reporterOffer('letters'));
  outcome('A letter to the paper', html, nevadaWeek);
}

function reporterOffer(why) {
  S.flags.offer = 1;
  scene.set('city', {});
  show({
    title: 'Twenty-five dollars a week',
    body: `<p>${why === 'forced' ? 'Four months of silver fever have left you with a great many opinions about rock, one pair of boots, and very little else.' : ''} A letter arrives from the <i>Territorial Enterprise</i>: they want you as city editor and reporter in Virginia City, at <b>$25 a week</b>.</p><p>Twenty-five dollars a week! You had been aiming at a million, and it was a considerable come-down. But a man can eat on twenty-five dollars a week, and drink a little, and the mines have shown no disposition whatever to pay you for either.</p>`,
    choices: [
      { t: 'Take the job', big: true, go: () => { startPaper(); } },
      { t: 'Hang on for one more strike', if: () => why !== 'forced', go: () => `<p>You wrote back that you would think it over. You did think it over, mostly at night, and mostly about the twenty-five dollars.</p>`, next: () => { S.flags.offer = 0; S.flags.letters = 0; nevadaWeek(); } },
    ],
  });
}

// ---------------------------------------------------------------- ACT 3: the newspaper
const LEADS = [
  { id: 'fanshaw', name: "Buck Fanshaw's funeral", text: 'Buck Fanshaw, a great fireman and a pillar of the saloons, is dead, and his friend Scotty Briggs has gone round to arrange the funeral with the new minister. The minister talks seminary and Scotty talks Washoe, and in an hour and a half neither has understood a word the other said.', base: 22, risk: 6 },
  { id: 'petrified', name: 'A petrified man', text: 'Somebody claims to have found a man turned to stone out in the desert, sitting up, and the coroner has been sent for. You could report it straight, or improve on it considerably.', base: 12, risk: 14 },
  { id: 'legis', name: 'The legislature', text: 'The Territorial legislature is in session at Carson, and is as good as a circus and a bear garden put together, and draws a better house than either.', base: 10, risk: 12 },
  { id: 'mill', name: 'A quartz mill accident', text: 'A boiler at one of the stamp mills has gone up. Nobody was killed, but a cat was blown clear into the next ward and arrived there, witnesses say, in a temper.', base: 10, risk: 4 },
  { id: 'strike', name: 'A new strike on the Comstock', text: 'Every mine on the Comstock wants a notice in the paper, and most of them send a few feet of stock along with the request, out of pure friendship.', base: 14, risk: 8, pay: true },
  { id: 'zephyr', name: 'The Zephyr strikes again', text: 'The afternoon Zephyr has rearranged the town again. Several roofs are now in other counties, and one is believed to be in California.', base: 9, risk: 2 },
  { id: 'rival', name: 'The rival editor', text: 'The editor of the Virginia Union has printed something about your spelling, and honour, as it is understood on the Comstock, demands a reply.', base: 16, risk: 22 },
  { id: 'brawl', name: 'A saloon shooting', text: 'Somebody shot somebody at a bar on C Street again. The town is used to it by now, but the readers like the particulars.', base: 13, risk: 7 },
  { id: 'fire', name: 'The fire companies parade', text: 'Every fire company in town turns out in red shirts and brass helmets, with a band. Any company left out of the write-up will remember it at the next election, and at the next fire.', base: 8, risk: 5 },
  { id: 'ball', name: 'The Sanitary Fund ball', text: 'The ladies of the town are giving a ball for the Sanitary Fund, for the Union wounded in the War. Write it up with care, or not, and take the consequences.', base: 11, risk: 16 },
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
const PLAIN = ['You reported it straight, and the town nodded over its coffee and turned to the stock quotations.', 'It was a sober, accurate paragraph. The editor called it "respectable", which on the Comstock is not a compliment.', 'You gave the bare facts. Two men read it clear through, and one of them was you, and the other was the compositor, who had to.', 'It was plain and true. Nobody was angry, and nobody remembered it by supper.'];
const EMB = [{ k: 'plain', name: 'plain facts', r: 1, t: .5 }, { k: 'stretch', name: 'stretched', r: 1.6, t: 1 }, { k: 'whopper', name: 'a whopper', r: 2.6, t: 2 }];

function startPaper() {
  S.act = 'paper'; S.issue = 0; S.trouble = 0; S.readers = 20 + (S.flags.letters || 0) * 6 + (S.flags.lies || 0) * 3;
  log('Joined the Territorial Enterprise.');
  scene.set('city', {});
  outcome('Virginia City', `<p>Virginia City hung on the side of Mount Davidson like a town that had been thrown there and stuck. Under it the mines went down a thousand feet into hot rock; above, the saloons and banks, the theatres and churches and boarding houses were crowded together on streets so steep that one man’s front door looked down his neighbour’s chimney. There were fifteen thousand people in it, and every one of them was in a hurry, and most of them were rich, or about to be.</p><p>Your job was to fill a column of local news every day. When there was news, the editor said, that would be easy; when there wasn’t, you would learn.</p>`, paperIssue);
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
    if (l.pay && ek !== 'plain') { const c = ri(30, 90); cash += c; notes.push(`The grateful parties showed their gratitude in the customary way: ${money(c)}, discreetly, in an envelope.`); }
    if (l.s || l.w) notes.push(`<b>${l.name}.</b> ` + (ek === 'whopper' ? l.w : ek === 'stretch' ? l.s : pick(PLAIN)));
    if (id === 'fanshaw') notes.push(ek === 'whopper' ? 'Your account of Scotty and the minister had the whole town repeating Scotty’s half of the conversation in the saloons for a month, and the minister’s half in church.' : 'Your funeral piece was tender and very funny, and Scotty bought you a drink on it and said you had done Buck proud.');
    if (id === 'petrified' && ek === 'whopper') { notes.push('In your version the petrified man was winking one eye and thumbing his nose at the reader, for anybody who read closely. Nobody did. Papers back East reprinted it as sober fact, and a scientist in London wrote in about it.'); t += 4; }
    if (id === 'rival' && ek !== 'plain') notes.push('The rival editor replied in print that you were a liar, a coward and a poor speller. Only the third was fair.');
    rd += r; tr += t;
  }
  const first = leads.find(x => x.id === [...picks.keys()][0]);
  const head = esc(first.name).toUpperCase();
  const html = `<div class="headline">${head}</div>${notes.map(n => `<p>${n}</p>`).join('') || '<p>The issue went out, and the town read it at breakfast along with its ham and its mining stocks.</p>'}` + fx({ readers: rd, trouble: tr, money: cash, sp: 3 }) + `<p class="where">+$25 salary</p>`;
  if (S.trouble >= 100 && !S.flags.duel) return outcome('Off the press', html, duel);
  outcome('Off the press', html, paperIssue);
}
function duel() {
  S.flags.duel = 1; scene.set('city', {});
  show({
    title: 'A challenge', body: `<p>A gentleman you have written about too freely sends round a formal challenge to a duel, with pistols, at dawn, in a ravine outside town. Your friend Steve Gillis, a small man and a dead shot, offers to act as your second and to teach you to shoot in the meantime, which he calculates should take about a night.</p>`,
    choices: [
      { t: 'Accept, and let Steve do some shooting', go: () => `<p>At dawn you practised on a barn door, and hit the county, but not the door. Just as your opponent’s party came over the ridge, Steve shot the head off a little sparrow at thirty yards and told them you had done it, and your opponent, hearing that, recollected urgent business elsewhere and went to attend to it.</p><p>Unfortunately duelling had lately been made a penitentiary offence in the Territory, and word got around, and your friends advised you that San Francisco was very pleasant at that time of year, and that the stage left at four.</p>` + fx({ sp: 10, readers: 30 }), next: () => window.partTwo ? partTwo('duel') : ending('duel') },
      { t: 'Print a handsome apology', go: () => `<p>The apology was so handsome that the gentleman was offended all over again, though he could not have told you exactly where. The matter cooled.</p>` + fx({ trouble: -40, readers: -10 }), next: paperIssue },
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
    laid: ['Sent home to mend', `<p>The West wore you down. A doctor put you on a stage back to the States with a bottle of something brown and strict orders to rest, and Orion went on with the Territory’s business without you. Years afterward you still told the story, but it was a short one, and nobody asked for it twice.</p>`],
    quit: ['Took the next coach home', `<p>Your heart went out of it. You took the next stage home and spent the rest of your life telling people in Missouri that you had seen the West, which was true, as far as it went, and it had not gone far.</p>`],
    paper: ['A writer, by accident', `<p>Eight issues later you had a name in every saloon on the Comstock, and the name was not quite your own. To sign your pieces you had borrowed the old Mississippi leadsman’s call for two fathoms of safe water: <b>Mark Twain</b>.</p><p>In time you went on to San Francisco, and to the Sandwich Islands as a correspondent, and onto the lecture platform, and at last you wrote it all down in a book. You left out nothing important, and put in a great many things that were better than the truth.</p>`],
    duel: ['Left for San Francisco, in a hurry', `<p>You took the stage over the Sierra that night, with Steve Gillis for company and your pen name in your pocket: <b>Mark Twain</b>, the old Mississippi leadsman’s call for two fathoms of safe water. San Francisco gave you a newspaper, and an earthquake, and in time a voyage to the Sandwich Islands; from there it was only a short trip to the lecture platform and a book about roughing it.</p>`],
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
