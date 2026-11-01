// Roughing It, Parts II and III: San Francisco (1864–66) and the Pacific (the Sandwich Islands,
// 1866), ending with the first lecture. Loaded after game.js and uses its helpers (show, outcome,
// fx, deal, scene, S...). The narration is written for this game; the events follow the last
// third of the book.
'use strict';

const setDate = (y, m, d) => { S.day = Math.max(S.day, Math.round((new Date(y, m - 1, d) - START) / 864e5)); };
const feat = f => { S.feats = S.feats || []; if (!S.feats.includes(f)) S.feats.push(f); };
const addBonus = n => { S.bonus = (S.bonus || 0) + n; };
function partCard(num, name, sub, body, next) {
  sfx('fanfare');
  show({ title: `Part ${num}: ${name}`, where: sub, body, choices: [{ t: 'Begin →', big: true, go: () => { next(); } }] });
}

window.ACT_LABELS = {
  sf: () => 'San Francisco',
  pocket: () => 'Jackass Hill',
  pacific: () => S.isle ? ISLES[S.isle].name : 'At sea',
  lecture: () => 'Academy of Music',
};

// =============================================================== PART II: SAN FRANCISCO
const LODGING = {
  lick: { name: 'the Lick House', cost: 30, hp: 2, sp: 3, note: 'Velvet chairs, gaslight, a dining room like a cathedral. The feet in your pocket pay for it, for now.' },
  board: { name: 'a boarding house on Bush Street', cost: 12, hp: 0, sp: 0, note: 'Clean sheets, hash on Tuesdays, a landlady with a memory for rent.' },
  garret: { name: 'a garret on Minna Street', cost: 4, hp: -3, sp: -3, note: 'A slanted ceiling, a cot, and a window onto other people’s chimneys.' },
};

window.partTwo = function (kind) {
  S.act = 'sf'; S.trouble = 0; S.sfWeek = 0; S.lodging = 'lick'; S.callJob = true;
  S.flags.crashWeek = ri(3, 6); S.flags.quakeWeek = ri(5, 10);
  if (!S.mkt) initMarket();
  // everyone in Washoe has a little silver to sell; you bring yours to the city
  S.feet['Hale & Norcross'] = (S.feet['Hale & Norcross'] || 0) + 20;
  if (!S.mkt.some(m => m.name === 'Hale & Norcross')) S.mkt.push({ name: 'Hale & Norcross', p: 30, vol: .18, drift: .03, last: 30 });
  setDate(1864, 5, 29);
  log('Part II: went down to San Francisco.');
  scene.set('sf', {});
  partCard('II', 'San Francisco', 'May 1864 · the Pacific coast', `
    ${kind === 'duel' ? '<p>You leave Virginia City by the night stage, one jump ahead of the new law against duelling, with Steve Gillis for company and your reputation in a carpetbag.</p>' : '<p>Eight issues of the <i>Enterprise</i> have given you a name in every saloon on the Comstock. You go down to San Francisco for a holiday. It lasts two years.</p>'}
    <p>Over the Sierra, down through the gold country, and suddenly the air is soft and damp and smells of salt. After two years of sagebrush, San Francisco is a marvel: gaslit streets, cable-less horse cars, French restaurants, a fog that comes in through the Golden Gate every afternoon like a tide of wet wool. There are theatres and booksellers and ladies in silk. Nobody here has ever heard of you.</p>
    <p>You have a little silver stock: twenty feet of Hale &amp; Norcross, which every broker on Montgomery Street assures you is about to climb. You take rooms at the Lick House, the finest hotel on the coast, and order dinner like a capitalist.</p>
    <blockquote>Each week, choose how to spend it. Pay your lodgings. Watch the stock board. Somewhere in here is the chance of a lifetime, if you can find it.</blockquote>`, () => sfHub());
};

function sfHub(note) {
  S.act = 'sf'; scene.set('sf', {});
  if (checkDeath()) return;
  if (S.pending) { const ev = S.pending; S.pending = null; return ev === 'quake' ? quake() : pauper(); }
  if (S.sfWeek >= 18 && !S.flags.union) return unionOffer(true);
  const L = LODGING[S.lodging];
  const worth = feetWorth();
  const warn = S.sfWeek === S.flags.crashWeek - 1 ? '<p><i>The board is giddy this week. Bootblacks are buying feet. Your barber gives you a tip on the Gould &amp; Curry while he shaves you. It is the kind of week old brokers remember afterwards.</i></p>' : '';
  show({
    title: `San Francisco, week ${S.sfWeek + 1}`,
    where: `${dateStr()} · living at ${L.name} ($${L.cost}/wk) · cash ${money(S.money)}${worth ? ` · feet worth ${money(worth)}` : ''}`,
    body: (note || '') + warn + `<p>${deal(SF_FLAVOR)}</p>`,
    choices: [
      { t: 'Work the week as a reporter for the Morning Call', sub: '$40 a week, and every minute of it earned', if: () => S.callJob, go: () => { callWeek(); } },
      { t: 'Write a sketch for the literary weeklies', sub: 'the Californian pays little, but people read it', go: () => { sketchWeek(); } },
      { t: 'Watch the stock board', sub: 'buy and sell your feet', if: () => S.mkt && S.mkt.length, go: () => { market(null, { back: () => sfHub(), wait: () => sfWeekEnd(1), label: '← back to the city', scene: 'sf' }); } },
      { t: 'See the city', sub: 'a week of wandering', go: () => { cityWeek(); } },
      { t: 'Go pocket-mining at Jackass Hill', sub: 'a few weeks in the gold country with an old friend', if: () => !S.flags.pocket, go: () => { pocketTrip(); } },
      { t: 'Change your lodgings', go: () => { lodgingMenu(); } },
      { t: 'Rest a week', sub: '+health, +spirits', go: () => { sfWeekEnd(1); return `<p>You sleep late, walk on the beach at North Point, and let the fog take care of the afternoons.</p>` + fx({ hp: 8, sp: 6 }); }, next: () => sfHub() },
      { t: 'Accept the Sacramento Union’s commission to the Sandwich Islands', big: true, if: () => S.sfWeek >= 6 && !S.flags.union, go: () => { unionOffer(false); } },
    ],
  });
}
const SF_FLAVOR = [
  'Montgomery Street is a river of stovepipe hats, every one of them talking about feet.',
  'A sea captain at the hotel bar tells you about Honolulu: warm rain, flowers in December, no snow ever. You find you cannot stop thinking about it.',
  'The fog comes in at four o’clock as if it had an appointment.',
  'At the Occidental a man introduces himself as a millionaire and borrows a dollar from you.',
  'The horse car up Third Street is so crowded that you ride the whole way on the step with one foot and a great deal of faith.',
  'Booksellers on Montgomery Street have the newest novels from New York only five weeks late. It feels like civilisation.',
  'A clipper comes in through the Gate under full sail, and the whole waterfront stops work to watch her.',
  'The city has more newspapers than it has readers, and you are beginning to know most of the editors by their debts.',
  'A street preacher in Portsmouth Square predicts the end of the world on Thursday. On Friday he is there again, unembarrassed.',
  'A week of perfect weather, which the locals call unusual every single time.',
];

function sfWeekEnd(n) {
  for (let i = 0; i < n; i++) {
    S.sfWeek++; S.day += 7;
    const L = LODGING[S.lodging];
    S.money -= L.cost; S.hp = clamp(S.hp + L.hp, 0, 100); S.sp = clamp(S.sp + L.sp, 0, 100);
    if (S.sfWeek === S.flags.crashWeek) crash(); else for (const n2 of tickMarket()) if (S.feet[n2.m.name] > 0) log(n2.text);
  }
  // big moments wait for the next visit to the hub, so this week's result is seen first
  if (S.sfWeek >= S.flags.quakeWeek && !S.flags.quake) { S.flags.quake = 1; S.pending = 'quake'; }
  else if (S.money < 0 && !S.flags.pauper) { S.flags.pauper = 1; S.pending = 'pauper'; }
  return !!S.pending;
}
function crash() {
  const before = feetWorth();
  for (const m of S.mkt) { m.last = m.p; m.p = Math.max(.05, Math.round(m.p * rnd(.04, .22) * 100) / 100); }
  const lost = before - feetWorth();
  S.flags.crashed = 1;
  if (lost > 50) { S.flags.ruined = 1; log(`The silver bubble burst. Lost ${money(lost)} on paper.`); }
  else log('The silver bubble burst. You had already sold. Lucky, or wise.');
}

function lodgingMenu() {
  show({
    title: 'Where to sleep', body: `<p>In San Francisco a man’s address tells you what his stocks did this week. You can move up or down as your fortunes require. Most people move in one direction.</p>`,
    choices: [
      ...Object.entries(LODGING).map(([k, L]) => ({ t: `${L.name[0].toUpperCase() + L.name.slice(1)} · $${L.cost} a week`, sub: L.note + (S.lodging === k ? ' (you live here now)' : ''), disabled: S.lodging === k, go: () => { const up = L.cost > LODGING[S.lodging].cost; S.lodging = k; log(`Moved to ${L.name}.`); return `<p>${up ? 'You move up in the world, with a hired cart and a little swagger.' : 'You move down in the world, carrying your own trunk, by the back stairs, after dark.'}</p>`; }, next: () => sfHub() })),
      { t: '← stay where you are', go: () => { sfHub(); } },
    ],
  });
}

// --- the Morning Call: drudgery with the odd bright spot
const CALL = [
  { t: 'Police court', b: 'Every morning at nine the city’s drunks, brawlers and stray philosophers are paraded before Judge Shepheard (who has heard it all) and fined five dollars apiece.', a: ['Write it up as comedy', 'Your account of a sailor who defended himself in verse runs on page one. The sailor writes in to praise the review.', { readers: 8, sp: 3 }], c: ['Give the plain list of names and fines', 'Forty names, forty fines. The compositors set it in their sleep, and so do the readers.', { sp: -3 }] },
  { t: 'The theatre', b: 'A touring company is doing a melodrama in which the heroine is rescued from a sawmill, a train, a flood and the villain, in that order, in one evening.', a: ['Review it honestly', 'You say the sawmill gave the best performance. The manager stops sending you free tickets.', { readers: 7, sp: 4 }], c: ['Review it kindly', 'You praise the scenery and the heroine’s lungs. The manager sends round a box of cigars.', { sp: 2, money: 5 }] },
  { t: 'A fire on Kearny Street', b: 'The bells ring at midnight. A cigar store is burning, and four volunteer companies are racing each other to be first at the hydrant.', a: ['Run to it', 'You arrive in time to be soaked by two companies at once, both claiming the honour.', { hp: -5, readers: 6 }], c: ['Report it from the saloon across the street', 'You get the whole story from the firemen as they come in to recover. It is more vivid than the fire.', { readers: 3, sp: 3 }] },
  { t: 'The shipping list', b: 'Your duties include listing every ship in and out of the harbour, with its tonnage and cargo. There are a great many ships. They are all very similar.', a: ['Liven it up', 'You describe a lumber schooner as "proud and mysterious". The editor removes the adjectives with a long knife.', { sp: -2 }], c: ['Copy it out faithfully', 'You copy it out. A small part of you dies, but the tonnage is correct.', { sp: -5 }] },
  { t: 'A runaway on Montgomery Street', b: 'A grocer’s horse has taken fright at a velocipede and gone down Montgomery Street with the cart, the grocer and a barrel of pickles.', a: ['Chase it', 'You run four blocks and arrive in time to see the horse eating the pickles, calm as a deacon.', { hp: -3, readers: 6 }], c: ['Interview the velocipede', 'Its owner, a dentist, insists it was the horse’s fault. You print both sides. Nobody is satisfied.', { readers: 4 }] },
  { t: 'A séance on Stockton Street', b: 'A medium is raising spirits for fifty cents a head. Your editor wants the story; the spirits want fifty cents.', a: ['Ask the spirits hard questions', 'You ask the departed for the price of Ophir next week. The table bangs twice and the medium asks you to leave.', { readers: 8, sp: 4 }], c: ['Report what you saw, politely', 'The spirits knocked, a trumpet floated, and a lady fainted on schedule. You write it straight and let the readers decide.', { readers: 3 }] },
  { t: 'The Board of Supervisors', b: 'The Supervisors are debating whether to pave a street. They have been debating it since the street was a sand dune.', a: ['Report the debate as a war', 'Your dispatch from the "Battle of Folsom Street" is cut by half and still annoys four Supervisors.', { readers: 6, trouble: 4 }], c: ['Report the vote', 'They voted to discuss it again. You report that, in one sentence.', { sp: -3 }] },
  { t: 'A perpetual motion machine', b: 'A man in a basement on Jackson Street has built a wheel that will turn forever, he says, as soon as he gets it started.', a: ['Watch it for an hour', 'It does not move. Neither does the inventor, who stares at it with such faith that you write a gentle piece about hope.', { readers: 6, sp: 3 }], c: ['Note it and move on', 'Two lines on page three. Next week a second man builds a second machine to keep the first one company.', { readers: 1 }] },
  { t: 'A lost child', b: 'A small boy was lost on the waterfront for a whole day and turned up asleep in a coil of rope on a Sydney packet.', a: ['Write it warmly', 'Mothers all over the city read it twice. A sea captain sends the boy a parrot.', { readers: 7, sp: 6 }], c: ['Write it briskly', 'Found, returned, spanked. Three lines.', { readers: 1 }] },
  { t: 'The hotel arrivals', b: 'Another duty: the list of everyone who checked into the city’s hotels yesterday, spelled the way they spelled it themselves.', a: ['Make up a few distinguished guests', 'You add "the Duke of Washoe and suite" to the Occidental list. Three ladies call at the hotel to see him.', { readers: 5, trouble: 6 }], c: ['Copy the list', 'Mr. Smith of Stockton. Mr. Smith of Sacramento. Another Mr. Smith. You begin to suspect a conspiracy.', { sp: -4 }] },
  { t: 'A prizefight', b: 'Two heavyweights are to fight on a barge in the bay, out of the police’s reach, for a purse of two thousand dollars.', a: ['Go out on the tug', 'Seventy rounds. The barge drifts halfway to Oakland. You write the whole thing as a naval battle.', { hp: -3, readers: 9 }], c: ['Get the result by telegraph', 'Somebody won. You have it by eleven.', { readers: 2 }] },
  { t: 'A billiard match', b: 'The champion of the Pacific coast is playing the champion of Nevada at the What Cheer House. You know nothing whatever about billiards.', a: ['Bluff it with technical terms', 'Your account is full of "kisses", "draws" and "a magnificent English". Billiard players read it with tears of laughter.', { readers: 7 }], c: ['Report the score', 'Five hundred to four hundred and something. You leave the something out.', { sp: -2 }] },
  { t: 'A wedding on Rincon Hill', b: 'A banker’s daughter marries a mining superintendent. There are four hundred guests and a cake shaped like a stamp mill.', a: ['Describe the cake in detail', 'The cake piece is a sensation. Two bakeries ask who did it.', { readers: 6, money: 5 }], c: ['Describe the bride', 'You describe the bride as charming. Her mother writes to say she was radiant. You print a correction.', { readers: 2 }] },
  { t: 'Sunday at the Cliff House', b: 'All the city’s horses go out to the Cliff House on Sunday to look at the sea lions, and all the city’s people go with them.', a: ['Interview a sea lion', 'You quote the largest one at length. He is against the tariff and in favour of fish.', { readers: 8, sp: 4 }], c: ['Count the carriages', 'Two hundred and twelve. You check twice.', { sp: -2 }] },
];
function callWeek() {
  scene.set('sf', { press: true });
  if (S.callWeeks >= 4 && !S.flags.callStory) return callStory();
  const e = deal(CALL);
  show({
    title: `On the Call: ${e.t}`, where: 'Morning Call, Commercial Street · $40 this week',
    body: `<p>Your days run from nine in the morning to eleven at night: the police court, the hotels, the theatres, the ships, the fires and whatever else the city does when nobody is looking. You are the only reporter on the paper.</p><p>${e.b}</p>`,
    choices: [e.a, e.c].map(([t, r, d]) => ({ t, go: () => { S.callWeeks = (S.callWeeks || 0) + 1; sfWeekEnd(1); return `<p>${r}</p>` + fx({ ...d, money: 40 + (d.money || 0), sp: -4 + (d.sp || 0) }); }, next: () => sfHub() })),
  });
}
function callStory() {
  S.flags.callStory = 1;
  show({
    title: 'The story the Call won’t print',
    body: `<p>One Sunday you watch a gang of young toughs stone a Chinese laundryman in the street while a policeman looks on with interest and does nothing at all. You go back to the office and write it up with every bit of fire you have.</p><p>The next morning it is not in the paper. The editor explains that the <i>Call</i> is read by the very people who did it, and the paper must think of its subscribers.</p>`,
    choices: [
      { t: 'Quit, and take the story somewhere that will print it', go: () => { S.callJob = false; S.flags.fired = 1; feat('Quit the Call on principle'); log('Left the Morning Call.'); sfWeekEnd(1); return `<p>You walk out. The piece runs in the <i>Enterprise</i> back in Virginia City instead, under your own name, and it stings everyone it should. You are out of a regular job, but you have discovered the one thing that makes you angriest, and you will write about it for the rest of your life.</p>` + fx({ readers: 25, sp: 6, trouble: 10 }); }, next: () => sfHub() },
      { t: 'Swallow it and keep your $40 a week', go: () => { sfWeekEnd(1); return `<p>You keep the job. You also keep the story, folded in your coat pocket, and every so often you take it out and read it again.</p>` + fx({ money: 40, sp: -12 }); }, next: () => sfHub() },
    ],
  });
}

// --- sketches for the literary weeklies
const SKETCHES = [
  { n: 'Answers to Correspondents', d: 'A mock advice column, answering letters nobody sent: what to do about a moustache that will not grow, and whether a gentleman may eat pie with a knife.', r: 16 },
  { n: 'A Ball at the Lick House, reported as a battle', d: 'The fashionable world arrives in silk and lace, and you report each lady’s gown like a general describing troop movements.', r: 15 },
  { n: 'Etiquette for Earthquakes', d: 'A guide for the polite San Franciscan: whom to bow to while the chimney is falling, and in what order to rescue one’s relatives.', r: 18, if: () => S.flags.quake },
  { n: 'The Story of the Bad Little Boy', d: 'A boy who steals jam, tells lies and skips Sunday school, and who, unlike the boys in the Sunday-school books, is never once punished for it.', r: 20 },
  { n: 'How to Cure a Cold', d: 'Every remedy your friends gave you, taken one after another: whiskey, gin, mustard plasters, a quart of salt water, and a lady’s advice to drink a quart of warm salt water.', r: 17 },
  { n: 'The City Directory, reviewed as a novel', d: 'Too many characters, no plot, and a great many Smiths, but a powerful ending in the Z’s.', r: 14 },
  { n: 'Ode to the Fog', d: 'A mock-heroic poem in nine stanzas to the San Francisco fog, which never reads poetry and arrives at four regardless.', r: 11 },
  { n: 'Advice to Young Men Going West', d: 'Bring a coat. Bring a second coat. Do not buy feet from a man in a stovepipe hat. Do not buy a horse from his brother.', r: 15 },
  { n: 'A Visit to the Mint, as told by a coin', d: 'A twenty-dollar piece describes its birth in the Mint, its first owner, and the indignity of being bet on a horse called Lightning.', r: 13 },
  { n: 'Lucretia Smith’s Soldier', d: 'A sentimental war romance, done so very sentimentally that it turns inside out at the end, and the soldier turns out to be someone else entirely.', r: 16 },
  { n: 'A Complaint about the Horse Cars', d: 'An open letter to the horse-car company from a man who has ridden the whole length of Third Street standing on another man’s foot.', r: 12 },
  { n: 'Dinner with the Mining Men', d: 'A dinner party where every sentence, including the grace, is about feet, assessments and assays.', r: 13 },
  { n: 'Concerning the Dogs of San Francisco', d: 'A census of the city’s dogs, their politics, and their opinion of the new dog tax.', r: 12 },
  { n: 'The Lodging-House Ghost', d: 'A ghost haunts your boarding house, rattling chains at night. On investigation it turns out to want only a better room.', r: 15 },
  { n: 'A Literary Tea', d: 'You are invited to a tea where everyone is a poet. You are asked to read. You read the shipping list, with feeling.', r: 14 },
  { n: 'An Inquiry into the Great Bean Question', d: 'Boarding houses serve beans seven days a week. You investigate why, and whether the beans are the same beans.', r: 12 },
  { n: 'My Late Senatorial Secretaryship', d: 'Your service as private secretary to a statesman, during which you answered every letter he received with the wrong answer.', r: 17 },
  { n: 'The Facts in the Case of the Great Beef Contract', d: 'A citizen tries for thirty years to collect a government bill for thirty barrels of beef, and is passed from office to office into eternity.', r: 18 },
  { n: 'Washoe, explained to an Eastern lady', d: 'Patient answers to an imaginary lady in Boston who wants to know whether Nevada has streets, and whether the Zephyr is a young man.', r: 13 },
  { n: 'The Petrified Man, revisited', d: 'Your old hoax, followed into the papers of the East, which have treated it with total seriousness and asked for photographs.', r: 14, if: () => (S.usedLeads || []).includes('petrified') },
  { n: 'The Celebrated Jumping Frog of Calaveras County', d: 'The story you heard in the Angel’s Camp tavern, about a gambler, his trained frog Dan’l Webster, and a stranger with a pocketful of quail shot, told exactly as the old man told it: slowly, gravely, and without once noticing that it is funny.', r: 60, if: () => S.flags.frogHeard, frog: true },
];
function sketchWeek() {
  scene.set('sf', {});
  const avail = SKETCHES.filter(k => (!k.if || k.if()) && !(S.sketched || []).includes(k.n));
  if (!avail.length) return outcome('Writer’s block', '<p>You sit at your desk all week and write nothing at all except a letter to your mother asking for nothing in particular.</p>', () => { sfWeekEnd(1); sfHub(); });
  // the frog, once heard, is always offered
  const frog = avail.find(k => k.frog);
  const opts = [...(frog ? [frog] : []), ...avail.filter(k => !k.frog).sort(() => Math.random() - .5)].slice(0, 3);
  show({
    title: 'A sketch for the weeklies', where: 'The Californian and the Golden Era pay a few dollars and a great deal of attention',
    body: `<p>The literary weeklies are where the city’s young writers show off for each other. ${S.flags.harte ? 'Bret Harte has promised to look over whatever you write; his pencil is merciless and his advice is good.' : 'The pay is poor, but the readers are the kind who remember a name.'}</p><p>Which sketch will you write this week?</p>`,
    choices: opts.map(k => ({ t: k.n, sub: k.d, go: () => {
      S.sketched = S.sketched || []; S.sketched.push(k.n);
      let r = Math.round(k.r * rnd(.8, 1.25) * (S.flags.harte ? 1.3 : 1) * (has('notebook') ? 1.1 : 1));
      sfWeekEnd(1);
      if (k.frog) {
        feat('The Jumping Frog'); addBonus(60); log('Published the Jumping Frog.');
        return `<p>You write the frog story down. It runs in the <i>Saturday Press</i> in New York, and then in every newspaper in the country that owns a pair of scissors. People who have never heard of Washoe are quoting Dan’l Webster at breakfast. Within a month you are, for the first time, a little famous.</p>` + fx({ readers: r, money: 15, sp: 15 });
      }
      return `<p>${pick(['The piece runs on Saturday. By Monday people are quoting it to you, wrongly.', 'The editor laughs out loud at it, which he says he has not done since the Mexican War.', 'It runs, and a paper in Sacramento steals it the next week, which is the sincerest form of praise on this coast.', 'A lady at the Lick House asks if you are the man who wrote it, then whether you are ashamed of yourself. You are not.'])}</p>` + fx({ readers: r, money: ri(6, 15), sp: 5 });
    } })),
  }, () => sfHub());
}

// --- the city
const CITY = [
  { t: 'The Cliff House', b: 'You hire a buggy and drive out the long road to the Cliff House, where the Pacific breaks white on the rocks and the sea lions sit on Seal Rock barking like a convention of aldermen.', fx: { sp: 9 } },
  { t: 'The Mint', id: 'harte', b: 'At the Branch Mint you meet the secretary to the superintendent, a neat, quiet, clever young man named Bret Harte who edits the Californian on the side. He has read your Washoe pieces. He offers to read your sketches before they go to print.', fx: { sp: 8, readers: 4 }, then: () => { S.flags.harte = 1; feat('Befriended Bret Harte'); } },
  { t: 'Mission Dolores', b: 'You walk out to the old adobe mission at the edge of the city, older than anything else in San Francisco, with roses in the graveyard and a calm about it that the rest of the city has not had time for.', fx: { sp: 7, hp: 2 } },
  { t: 'Telegraph Hill', b: 'From the top of Telegraph Hill a man with a semaphore signals ship arrivals to the city: arms up for a sidewheel steamer, arms out for a brig. You watch half the waterfront run to the wharves when he raises his arms.', fx: { sp: 6 } },
  { t: 'A Chinese theatre on Jackson Street', b: 'A play is in progress at the Chinese theatre, a historical drama that, the man beside you explains, began a week ago and will go on for some weeks yet. The costumes are magnificent, the orchestra is magnificent and loud, and the audience comes and goes with great courtesy. You stay three hours and understand a great deal more than you expected.', fx: { sp: 8 } },
  { t: 'The Oakland ferry', b: 'You take the ferry across the bay to Oakland for no reason but the ride. Gulls follow the boat the whole way, hoping you are carrying bread. You are not, and they let you know it.', fx: { sp: 6, hp: 2 } },
  { t: 'A Turkish bath', b: 'You try the new Turkish bath on Washington Street: steam, a marble slab, and a man who folds you up like a shirt. You emerge two inches taller and a new man, and the new man is very tired.', fx: { hp: 8, money: -3 } },
  { t: 'A waterfront saloon', b: 'Down on the waterfront, sailors from every country on earth are telling lies in every language on earth. A whaler from Nantucket tells you about the Sandwich Islands until the bar closes.', fx: { sp: 6, hp: -2 }, then: () => { S.flags.heardIslands = 1; } },
  { t: 'Woodward’s Gardens', b: 'A rich man has opened his gardens to the public: lawns, a conservatory, a sea-lion pool, a museum, a bear named Ben, and a balloon on Sundays. You spend a whole afternoon there and forget about stocks entirely.', fx: { sp: 9 } },
  { t: 'Portsmouth Square', b: 'In the old plaza a political speaker stands on a barrel and explains for two hours what is wrong with everything. A dog sits in front of him the whole time, listening with great attention, and is the only one to leave unconvinced.', fx: { sp: 5, readers: 2 } },
  { t: 'An evening with the Bohemians', b: 'You fall in with the city’s young writers and artists, who meet in a back room on Montgomery Street to drink, argue and read each other their work. They are poor, brilliant, and certain they will be famous. A few of them are right.', fx: { sp: 8, readers: 4 } },
  { t: 'The Pioneers’ parade', b: 'The Society of California Pioneers marches up Montgomery Street, old men who came in ’49, each one of whom would cheerfully explain that the city was much better before you arrived.', fx: { sp: 5 } },
];
function cityWeek() {
  const e = deal(CITY);
  sfWeekEnd(1);
  if (e.then) e.then();
  outcome(e.t, `<p>${e.b}</p>` + fx(e.fx), () => sfHub());
}

function quake() {
  scene.set('sf', { quake: true });
  show({
    title: 'Earthquake!', where: 'A Sunday, about noon',
    body: `<p>You are walking along Third Street when the world takes a step to the left. Then to the right. A frame house across the way leans out over the street like a man looking for a coin, thinks better of it, and settles back. A church bell rings all by itself. The whole street fills with people in every degree of dress, from Sunday best to bath towels, all looking up.</p><p>Then it is over, and a man beside you says, quite calmly, "That was a good one."</p>`,
    choices: [
      { t: 'Stand and take notes on everyone else', go: () => { S.flags.quakeNotes = 1; feat('Took notes during the earthquake'); return `<p>You note a man running out of a hotel with only a cigar, a lady carrying a birdcage with no bird, and a fireman who slid down a pole and kept going. It will make a very good sketch.</p>` + fx({ sp: 10, readers: 6 }); } },
      { t: 'Run for the middle of the street', go: () => `<p>You run for the middle of the street and are knocked down by a horse car that is running for the middle of the street too. Nothing broken but your dignity.</p>` + fx({ hp: -6, sp: 4 }) },
      { t: 'Duck into a doorway', go: () => `<p>You shelter in a doorway that turns out to belong to a saloon, and the saloon-keeper offers everyone a free drink to steady the nerves. You steady yours twice.</p>` + fx({ sp: 6, hp: -1 }) },
    ],
  }, () => sfHub());
}

function pauper() {
  scene.set('sf', { fog: true });
  show({
    title: 'Down and out', where: S.flags.crashed ? 'After the silver bubble burst' : 'At the bottom of your purse',
    body: `<p>The money is gone. ${S.flags.ruined ? 'The feet that were going to make you rich are now worth less than the paper they are written on, and you were going to sell next week.' : ''} You owe the landlady, the tailor and the restaurant, and you have taken to walking down side streets to avoid all three. For weeks at a time you do not have ten cents. You learn exactly how long a man can make a cup of coffee last at a free-lunch counter.</p>`,
    choices: [
      { t: 'Borrow from Steve Gillis', go: () => `<p>Steve hands over fifty dollars without a word, which is the kind of friend Steve is. You pay him back, eventually, in the form of a great many dinners.</p>` + fx({ money: 50, sp: 4 }) },
      { t: 'Move to the garret and tighten your belt', go: () => { S.lodging = 'garret'; return `<p>You move to a garret on Minna Street and live on bread, coffee and pride. The pride runs out first.</p>` + fx({ money: 20, sp: -6 }); } },
      { t: 'Go up to Jackass Hill until it blows over', if: () => !S.flags.pocket, go: () => { pocketTrip(); } },
    ],
  }, () => sfHub());
}

// --- Jackass Hill: pocket mining, a cat, and a frog
function pocketTrip() {
  S.flags.pocket = 1; S.act = 'pocket';
  scene.set('hill', {});
  show({
    title: 'Jackass Hill', where: 'Tuolumne County, in the old gold country',
    body: `<p>You go up into the foothills to stay with your friend Jim Gillis, Steve’s brother, in his cabin on Jackass Hill. The great days of the gold rush are long over here. The towns are half empty, the hills are green with oaks, and the few men left make a living at <b>pocket mining</b>: hunting for little nests of gold that the old miners missed, by washing pan after pan of dirt down a hillside and following the trail of specks uphill to their source.</p>
      <p>Jim’s partner is an old miner called Dick Baker, a grave, kind, slow-spoken man who has been looking for one more good pocket for eighteen years. He owns a large grey cat.</p>`,
    choices: [{ t: 'Ask Dick about the cat', go: () => tomQuartz() }],
  });
}
function tomQuartz() {
  S.flags.tomquartz = 1;
  show({
    title: 'Tom Quartz', body: `<p>Dick tells you, very seriously, about another cat he once had, called Tom Quartz: a cat of great judgment, who supervised all of Dick’s mining and knew more about it than most men. Tom Quartz was against quartz mining, Dick says. He thought it was a new-fangled notion.</p>
      <p>One day, while they were blasting a shaft, Tom Quartz went to sleep at the bottom of it. The fuse was lit. There was a great roar, and up out of the shaft, among a cloud of rocks and dirt, went Tom Quartz, turning over and over, spitting and clawing, a hundred and fifty feet into the air. He came down some way off, with his fur singed and a look on his face as though to say, "I hope you are satisfied."</p>
      <p>"After that," says Dick, "you never saw a cat so prejudiced against quartz mining in your life."</p>`,
    choices: [
      { t: 'Ask whether the story is true', go: () => `<p>Dick looks at you with deep reproach. You never ask again.</p>` + fx({ sp: 8 }) },
      { t: 'Write it down word for word', go: () => { feat('Wrote down Tom Quartz'); return `<p>You write it in your notebook exactly as he told it. You can feel it is worth more than any pocket in the county.</p>` + fx({ sp: 10, readers: 4 }); } },
    ],
  }, () => panning());
}
function panning() {
  // A hillside grid; the pocket sits near the top and its gold spreads downhill in a fan.
  // Each pan shows how many specks of gold that spot holds. Follow them up.
  const C = 9, R = 6, pc = ri(1, C - 2), pr = ri(0, 1);
  const specks = (c, r) => { if (c === pc && r === pr) return 'P'; const d = r - pr; if (d <= 0 || Math.abs(c - pc) > d) return 0; return Math.max(1, 9 - d - Math.abs(c - pc) * 2); };
  const panned = new Map(); let pans = 14, found = 0, dust = 0;
  const render = msg => {
    page.innerHTML = `<h2>Pocket hunting</h2><p class="where">${pans} pans left · the hilltop is at the top. Each pan shows the specks of gold in it. The specks fan out downhill from the pocket: follow them up to where they narrow, and dig.</p>
      ${msg ? `<p>${msg}</p>` : '<p>You start at the bottom of the slope with a pan, a bucket of water and a great deal of hope.</p>'}
      <div class="grid" style="grid-template-columns:repeat(${C},1fr);max-width:480px">${Array.from({ length: R * C }, (_, i) => { const c = i % C, r = (i - c) / C, k = `${c},${r}`, v = panned.get(k); return `<button class="cell${v !== undefined ? ' dug' + (v === 'P' ? ' vein' : '') : ''}" data-c="${c}" data-r="${r}" ${v !== undefined || !pans || found ? 'disabled' : ''} style="font-family:VT323,monospace;font-size:20px;${v > 0 ? 'color:#f3d38c' : ''}" aria-label="pan at column ${c + 1}, row ${r + 1}">${v === undefined ? '' : v === 'P' ? '★' : v === 0 ? '·' : '•' + v}</button>`; }).join('')}</div>
      <div class="choices"><button class="btn" id="panDone">${pans && !found ? 'Give up and go back to the cabin' : 'Back to the cabin →'}</button></div>`;
    page.querySelectorAll('.cell').forEach(b => b.onclick = () => {
      const c = +b.dataset.c, r = +b.dataset.r, v = specks(c, r); panned.set(`${c},${r}`, v); pans--; sfx('pick');
      let m;
      if (v === 'P') { found = ri(500, 2600); sfx('good'); m = `<b>A pocket!</b> The pan comes up yellow. You dig with your hands, and out of a seam the size of a hat come lumps of gold as big as beans. Dick Baker takes off his hat and holds it to his chest. It is worth <b>${money(found)}</b>.`; }
      else if (v > 0) { dust += v; m = `${v} specks. ${v >= 6 ? 'Close. The trail is narrowing.' : v >= 3 ? 'Warmer.' : 'A faint trace.'}`; }
      else m = pick(['Nothing but dirt.', 'Not a speck.', 'Dick shakes his head: off the trail.']);
      render(m);
    });
    $('panDone').onclick = () => finishPocket(found, dust, [...panned.keys()].some(k => { const [c, r] = k.split(',').map(Number); return Math.abs(c - pc) <= 1 && Math.abs(r - pr) <= 1; }));
  };
  render();
}
function finishPocket(found, dust, close) {
  sfWeekEnd(3); S.act = 'pocket';
  let html;
  if (found) { feat('Found a gold pocket'); html = `<p>You come down from Jackass Hill richer than you went up, which almost nobody does.</p>` + fx({ money: found + dust, sp: 15 }); }
  else if (close) html = `<p>On the last afternoon you are one pan from the pocket, you are sure of it, when a cold rain sets in. You leave a bucket of dirt standing, unwashed, and go back to the cabin to dry off. Two strangers come along the next morning, wash your bucket out of curiosity, and take a fortune out of the hillside where you left off. You hear about it a week later, in town, from one of them.</p>` + fx({ money: dust, sp: -6 });
  else html = `<p>Three weeks of panning and you have a little dust, sore knees and a deep respect for Dick Baker’s patience.</p>` + fx({ money: dust, hp: 4 });
  outcome('Down from the hill', html, () => frogTavern());
}
function frogTavern() {
  scene.set('hill', { tavern: true });
  show({
    title: 'A rainy week at Angel’s Camp', where: 'The tavern at Angel’s Camp, Calaveras County',
    body: `<p>On the way back it rains for a week, and you and Jim sit in the tavern at Angel’s Camp with nothing to do but eat beans and listen. An old fellow called Ben Coon, a former river pilot, fat and solemn, tells a long story about a man called Smiley who would bet on anything, and a frog called Dan’l Webster that he taught to jump, and a stranger who filled the frog full of quail shot so it could not get off the ground.</p><p>Coon tells it without the least idea that it is funny. He tells it as if it were a sermon. You and Jim nearly die.</p>`,
    choices: [
      { t: 'Remember every word', go: () => { S.flags.frogHeard = 1; log('Heard about a jumping frog.'); return `<p>For the rest of the week you and Jim say "I don’t see no p’ints about that frog that’s any better’n any other frog" to each other at every meal, and laugh until the landlord asks you to leave. You will write it down when you get back to the city.</p>` + fx({ sp: 14 }); } },
      { t: 'Try to get some sleep', go: () => `<p>You sleep through the best story you will ever hear. Jim tells it to you later, worse.</p>` + fx({ hp: 4 }) },
    ],
  }, () => sfHub(`<p>You come back down to the city with mud on your boots and a notebook full of the gold country.</p>`));
}

function unionOffer(forced) {
  S.flags.union = 1;
  scene.set('sf', {});
  show({
    title: 'A letter from the Sacramento Union',
    body: `<p>${forced ? 'You have had about all of San Francisco a man can stand. ' : ''}The new steamer <i>Ajax</i> is to make a run to the Sandwich Islands, and the <i>Sacramento Union</i> wants a correspondent aboard. They will pay <b>$20 a letter</b>, and your passage, for as many letters as you care to write from the islands about the sugar, the whaling, the volcanoes, the people, and anything else worth the postage.</p><p>Warm rain, a sea like blue silk, flowers in winter. You have been hearing about it in every waterfront saloon in the city.</p>`,
    choices: [{ t: 'Pack a bag and sail for Honolulu', big: true, go: () => { partThree(); } }],
  });
}

// =============================================================== PART III: THE PACIFIC
const ISLES = {
  oahu: { name: 'Honolulu, Oahu', scene: 'island' },
  hawaii: { name: 'Island of Hawaii', scene: 'island' },
  maui: { name: 'Maui', scene: 'island' },
};
const DAYS = 56; // the Union pays for as long as you can make the letters worth it; the ship home won't wait forever

function partThree() {
  S.act = 'pacific'; S.isle = null; S.pday = 0; S.notes = 0; S.letters = 0; S.done = []; S.trouble = 0; S.voyage = 0;
  setDate(1866, 3, 7);
  log('Part III: sailed for the Sandwich Islands on the Ajax.');
  scene.set('ocean', { steamer: true });
  partCard('III', 'The Pacific', 'March 1866 · aboard the steamer Ajax, bound for Honolulu', `
    <p>The <i>Ajax</i> steams out through the Golden Gate on a grey morning with a load of passengers, a cargo of hay and potatoes, and you. By noon California is a line on the horizon; by dark it is gone. There are two thousand one hundred miles of ocean between here and Honolulu, and nothing whatever in between.</p>
    <blockquote>In the islands, every day counts. Ride, climb, explore, and gather material (<b>notes</b>). Then turn your notes into <b>letters</b> to the Union: $20 each, and readers by the thousand. You have about ${DAYS} days before the ship home.</blockquote>`, () => voyageDay());
}

// --- the voyage out
const VOYAGE = [
  { t: 'Seasick', b: 'On the second day the <i>Ajax</i> meets a long Pacific swell and begins to roll like a cradle with ambitions. Half the passengers retire below and pray. The other half wish they had.', c: [['Stay on deck in the wind', 'The wind saves you. You are the only man at dinner, and you eat three dinners in sheer triumph.', { hp: 4, sp: 6 }], ['Go below and lie down', 'Below decks it is worse. You spend a day getting to know the ceiling of your cabin very well.', { hp: -8 }]] },
  { t: 'Whales', b: 'A spout on the starboard bow, and another, and then a whole pod of whales rolling past, their great backs shining like wet rocks.', c: [['Watch them until they’re gone', 'You stay at the rail for an hour. Later a passenger tells you exactly how many barrels of oil each one would make, and you wish he hadn’t.', { sp: 8, notes: 1 }]] },
  { t: 'Flying fish', b: 'The sea warms and turns a deep blue, and flying fish begin to skitter away from the bow in silver flocks, skimming yards over the waves.', c: [['Try to catch one', 'One lands on deck at your feet of its own accord. The cook fries it for you. It is delicious and a little sad.', { sp: 6, hp: 2 }]] },
  { t: 'Into the trade winds', b: 'Overnight the air turns soft and warm, and the overcoats go back into the trunks for good. The trade wind blows steady from the northeast, as reliable as a clock.', c: [['Sleep on deck', 'You sleep on deck under stars as bright as lamps, and wake with the sun on your face and a sailor stepping over you.', { hp: 6, sp: 6 }]] },
  { t: 'Cards in the saloon', b: 'A group of passengers have a game of whist going in the saloon that has lasted since San Francisco and may outlast the voyage.', c: [['Join in', 'You play whist for three days. You do not understand whist when you start, and you understand it less when you finish, but you win four dollars.', { money: 4, sp: 4 }], ['Watch and take notes', 'You take notes on each player’s method of losing. It is a sketch in itself.', { notes: 1 }]] },
];
function voyageDay() {
  S.act = 'pacific'; scene.set('ocean', { steamer: true });
  if (S.voyage === 2 && !S.flags.admiral) return admiral();
  if (S.voyage >= 5) return arriveHonolulu();
  const e = deal(VOYAGE); S.voyage++; S.day += 2;
  show({
    title: `At sea: ${e.t}`, where: `Day ${S.voyage * 2} out of San Francisco`, body: `<p>${e.b}</p>`,
    choices: e.c.map(([t, r, d]) => ({ t, go: () => { if (d.notes) { S.notes += d.notes; } const { notes, ...rest } = d; return `<p>${r}</p>` + fx(rest) + (d.notes ? '<p class="fx">+1 note</p>' : ''); }, next: voyageDay })),
  });
}
function admiral() {
  S.flags.admiral = 1; S.voyage++; S.day += 2;
  show({
    title: 'The Old Admiral', where: 'Aboard the Ajax',
    body: `<p>Among the passengers is a retired whaling captain everyone calls the Admiral: a big, warm-hearted, thunderous old man who has an opinion on every subject and a fact to prove it, most of the facts having been made up on the spot. He argues politics from breakfast to bedtime and has never, in living memory, lost.</p><p>But there is another passenger, a quiet man named Williams, who has been watching the Admiral for days with a thoughtful look.</p>`,
    choices: [
      { t: 'Egg Williams on', go: () => { feat('Saw the Admiral beaten'); return `<p>Williams starts a political argument with the Admiral and wins it by the Admiral’s own method: by inventing facts faster, quoting books that do not exist, and remembering battles that were never fought, with complete confidence and not a flicker of doubt. The Admiral is routed. He stares at Williams in perfect astonishment, then goes up on deck and is not heard from until Honolulu.</p>` + fx({ sp: 14 }) + '<p class="fx">+2 notes</p>'; }, next: () => { S.notes += 2; voyageDay(); } },
      { t: 'Argue with the Admiral yourself', go: () => `<p>You hold out for twenty minutes, which is a record. He shakes your hand afterwards and tells you that you are a fine young man and completely wrong about everything.</p>` + fx({ sp: 6, hp: -2 }) + '<p class="fx">+1 note</p>', next: () => { S.notes += 1; voyageDay(); } },
    ],
  });
}
function arriveHonolulu() {
  S.isle = 'oahu'; setDate(1866, 3, 18);
  scene.set('island', { harbor: true });
  log('Arrived at Honolulu.');
  outcome('Honolulu', `<p>On the eleventh morning a long green island rises out of the sea with a crater at one end, and the <i>Ajax</i> steams in past the reef into Honolulu harbour. The water is so clear you can see the coral on the bottom. On the wharf, half the town has turned out to meet the steamer: people in white, people on horseback, people with flowers, and a brass band that is playing something in a key of its own.</p>
    <p>You step ashore into a warm, damp, sweet-smelling air, under coconut palms, beside a white church and a row of little houses with verandas covered in vines, and feel all the ice of the Sierra melt out of you at once.</p>` + fx({ sp: 14, hp: 6 }), () => isleHub());
}

// --- island activities. Each takes days and gives notes (material for letters).
const ACT = {
  oahu: [
    { id: 'horse', t: 'Hire a horse and see Honolulu', d: 1, go: () => { S.flags.horse = 1; return `<p>You hire a horse from a man who describes it as spirited. It is a long, gloomy, thoughtful animal that walks only towards home. Ridden out of town it falls asleep; turned back towards the stable, it bolts. You spend the day seeing Honolulu in a series of reluctant walks and terrified gallops, and see a great deal of it: the white coral houses, the gardens of oleander and tamarind, the gay crowds of riders with flowers in their hats, and, very close, a great many fences.</p>` + fx({ sp: 8, hp: -4 }); }, n: 2 },
    { id: 'pali', t: 'Ride up the Nuuanu valley to the Pali', d: 1, go: () => `<p>The road climbs through a valley green as a dream, and ends at the Pali: a sheer precipice a thousand feet high, with the whole windward coast laid out below like a map, and a gale that will take your hat to Japan. Here, your guide tells you, the great chief Kamehameha drove his enemies over the cliff in the battle that made him king of all the islands. You stand a long time looking down.</p>` + fx({ sp: 10 }), n: 2 },
    { id: 'surf', t: 'Try surf-bathing at Waikiki', d: 1, go: () => { S.flags.surf = 1; return `<p>At Waikiki you watch the young men of the island lie on long boards, wait for a great wave, and come racing in on its crest like a bird. It looks easy. You borrow a board, paddle out, choose your wave with care, and set off. The board arrives on the beach a good three-quarters of a second before you do. You arrive some time later, by a different route, with a quart and a half of the Pacific inside you. Nobody, they tell you kindly, learns it on the first day. Or the second.</p>` + fx({ sp: 9, hp: -6 }); }, n: 2 },
    { id: 'legis', t: 'Watch the Legislature in session', d: 1, go: () => `<p>The kingdom’s Legislature meets in a plain hall, nobles and elected representatives together, and every speech is made twice, once in Hawaiian and once in English, by a patient interpreter. You discover that the Hawaiian version is always longer, livelier and more convincing, and that the English one leaves out all the jokes.</p>` + fx({ sp: 6, readers: 3 }), n: 2 },
    { id: 'saturday', t: 'Spend Saturday in town', d: 1, go: () => `<p>On Saturday afternoon everybody in Honolulu rides. Hundreds of riders gallop through the streets, women riding astride with long bright skirts streaming behind them, wreathed in flowers, laughing, racing each other to the beach. You stand on a corner with your notebook and are nearly run over by the most cheerful people you have ever seen.</p>` + fx({ sp: 10 }), n: 2 },
    { id: 'sugar', t: 'Visit a whaling captain on the waterfront', d: 1, go: () => `<p>The whaling fleet is in: dozens of ships, back from the Arctic with full holds. A Nantucket captain gives you dinner aboard and tells you how the trade is dying, and why, and what Honolulu will be when it is gone. It is the best economics lecture you ever had, and it ends with pie.</p>` + fx({ sp: 6 }), n: 2 },
  ],
  hawaii: [
    { id: 'kona', t: 'Ride the Kona coast', d: 2, go: () => `<p>Two days on horseback down the Kona coast, through orange groves, coffee trees and bananas, along black lava cliffs where the surf bursts white. In every village people come out to watch the stranger go by and offer you fruit, and on the second night an old couple put you up in a grass house that is cooler and cleaner than the Lick House.</p>` + fx({ sp: 12, hp: 3 }), n: 3 },
    { id: 'cook', t: 'Visit Kealakekua Bay, where Captain Cook died', d: 1, go: () => `<p>At Kealakekua Bay you stand on the flat black rock at the water’s edge where Captain Cook was killed in 1779, after the islanders who had welcomed him as something more than a man came to understand that he was only a man after all, and a demanding one. There is a stump of a coconut tree with a copper plate on it. The bay is very quiet. You think a long time about how strangers ought to arrive in other people’s countries.</p>` + fx({ sp: 4 }), n: 3 },
    { id: 'refuge', t: 'See the Place of Refuge at Honaunau', d: 1, go: () => `<p>Behind a great wall of fitted black lava, built without mortar and broad enough to drive a wagon along, lies the old Place of Refuge. Anyone who had broken a sacred law, or was fleeing a battle, could run here, and if he reached the wall before his pursuers, he was safe, forgiven, and could go home. You walk along the wall in the sun and decide that it is a better idea than most of the laws you have seen made.</p>` + fx({ sp: 8 }), n: 3 },
    { id: 'volcano', t: 'Go up to the volcano, Kilauea', d: 3, go: () => volcano() },
    { id: 'hilo', t: 'Ride to Hilo and the waterfalls', d: 2, go: () => `<p>On the wet side of the island the rain falls warm every afternoon, and the whole country is ferns, waterfalls and rushing streams. At Hilo you swim in a pool under a falls with a crowd of children who are frankly astonished at how badly a grown man can swim.</p>` + fx({ sp: 9, hp: 4 }), n: 2 },
  ],
  maui: [
    { id: 'haleakala', t: 'Climb Haleakala for the sunrise', d: 2, go: () => haleakala() },
    { id: 'iao', t: 'Ride into the Iao Valley', d: 1, go: () => `<p>The Iao Valley is a green cathedral: walls of rock thousands of feet high, hung with ferns and waterfalls, and a great green needle of stone standing up in the middle of it. Your guide tells you of the battle fought here, so terrible that the stream ran red. Today there is nothing but birdsong and the sound of water.</p>` + fx({ sp: 10 }), n: 2 },
    { id: 'plantation', t: 'Stay at a sugar plantation', d: 2, go: () => `<p>A planter shows you his cane fields and his mill, and talks sugar for two days: rainfall, yields, freight rates and the price per pound in San Francisco. You take careful notes. Sugar, you come to see, is the future of these islands, and the planters intend that it should be, whatever the islands think about it.</p>` + fx({ sp: 4, hp: 6 }), n: 3 },
  ],
};
const ISLE_EVENTS = [
  { t: 'A centipede', b: 'You wake in the night to find a centipede six inches long, with forty legs and a temper to match, walking thoughtfully across your pillow. You leave the bed to it.', fx: { hp: -3, sp: 2 }, flag: 'bugs' },
  { t: 'A scorpion', b: 'A scorpion has taken up residence in your boot. You and the scorpion discover this at the same moment, and neither of you is pleased.', fx: { hp: -6, sp: 2 }, flag: 'bugs' },
  { t: 'Mosquitoes', b: 'The mosquitoes here are the size of small birds and work in shifts. You sleep under a net and they sit on top of it, waiting, like creditors.', fx: { hp: -4 } },
  { t: 'A rain squall', b: 'A squall comes over the hills, drenches you completely in four minutes, and passes on, and twenty minutes later you are dry again in the sun. It happens four times before lunch.', fx: { sp: 3 } },
  { t: 'Poi', b: 'Your hosts serve poi, the paste of pounded taro root that is the bread of the islands. It is eaten with the fingers, one finger or two depending on how thick it is. You eat it bravely. By the third day you like it.', fx: { hp: 4, sp: 4 } },
  { t: 'A feast', b: 'You are invited to a feast: a whole pig roasted underground in an oven of hot stones, fish baked in leaves, sweet potatoes, bananas and poi, all eaten on mats under the trees. Afterwards there is singing that goes on long after the moon is up.', fx: { hp: 6, sp: 10 }, notes: 1 },
  { t: 'A legend of Pele', b: 'Your guide tells you about Pele, the goddess of the volcano, who lives in the fire pit, travels the islands as an old woman or a young girl, and does not like to be disrespected. He tells it with great seriousness. You resolve to be very polite on the mountain.', fx: { sp: 5 }, notes: 1 },
  { t: 'Mail from home', b: 'A ship arrives with mail. Your mother writes to ask whether you are eating properly and whether the natives are friendly. You write back that they are friendlier than the people in San Francisco and feed you better.', fx: { sp: 8 } },
  { t: 'A reef in a canoe', b: 'A fisherman takes you out over the reef in an outrigger canoe. Through the clear water you look down into gardens of coral, purple and gold and green, with fish of every colour drifting through them like flowers in the wind.', fx: { sp: 9 }, notes: 1 },
  { t: 'Sunburn', b: 'You fall asleep on the beach in the afternoon and wake up the colour of a boiled lobster. For three days you sleep standing up.', fx: { hp: -5 } },
  { t: 'Saddle-sore', b: 'Days of riding have left you with saddle boils of a severity that a doctor describes, admiringly, as remarkable. You learn to sit down in stages.', fx: { hp: -7 }, flag: 'boils' },
  { t: 'A sea of stars', b: 'You sit on a veranda late at night, with the surf booming on the reef and the Southern Cross low over the sea, and decide that you will write a book about all of this some day.', fx: { sp: 8 } },
];

function isleHub(note) {
  S.act = 'pacific';
  const I = ISLES[S.isle];
  scene.set(S.isle === 'hawaii' ? 'island' : S.isle === 'maui' ? 'island' : 'island', { harbor: S.isle === 'oahu', mountain: S.isle !== 'oahu' });
  if (checkDeath()) return;
  const left = DAYS - S.pday;
  if (left <= 0) return sailHome(true);
  const acts = ACT[S.isle].filter(a => !S.done.includes(a.id));
  const hornetReady = S.isle === 'oahu' && S.pday >= 22 && !S.flags.hornet;
  show({
    title: I.name, where: `${dateStr()} · ${left} days left in the islands · ${S.notes} note${S.notes === 1 ? '' : 's'} unwritten · ${S.letters} letter${S.letters === 1 ? '' : 's'} sent`,
    body: (note || '') + `<p>${S.isle === 'oahu' ? 'Honolulu drowses in the sun under its palms. There is always a horse to hire, a veranda to sit on, and somebody with a story.' : S.isle === 'hawaii' ? 'The biggest island: black lava, green coast, snow on the high mountains, and the volcano always smoking in the distance.' : 'Two great mountains joined by a low green isthmus of cane fields, and over everything the vast slope of Haleakala.'}</p>`,
    choices: [
      ...(hornetReady ? [{ t: '⚑ News at the harbour: survivors of a shipwreck!', big: true, go: () => { hornet(); } }] : []),
      ...acts.map(a => ({ t: a.t, sub: `${a.d} day${a.d > 1 ? 's' : ''}`, disabled: a.d > left, go: () => doAct(a) })),
      { t: 'Write a letter to the Union', sub: S.notes ? `a day at the desk; turns up to 3 notes into a letter ($20)` : 'you have no notes; go and see something first', disabled: !S.notes, go: () => writeUnion() },
      { t: 'Loaf in the shade a day', sub: '+health, +spirits', go: () => { S.pday++; S.day++; return `<p>${pick(['You lie in a hammock under a tamarind tree and listen to the trade wind in the palms. It is the most productive day you have spent in years, in its way.', 'You sit on the veranda with a slice of melon and watch the whole world go by on horseback.', 'You do nothing at all, carefully, all day.'])}</p>` + fx({ hp: 6, sp: 5 }); }, next: () => isleHub() },
      ...Object.keys(ISLES).filter(k => k !== S.isle).map(k => ({ t: `Sail to ${ISLES[k].name}`, sub: 'an inter-island schooner, 2 days, $10', disabled: S.money < 10 || left < 3, go: () => sailTo(k) })),
      { t: 'Book passage home to San Francisco', sub: 'end your stay in the islands', if: () => S.pday >= 14, go: () => { sailHome(false); } },
    ],
  });
}
function doAct(a) {
  S.done.push(a.id); S.pday += a.d; S.day += a.d;
  const r = a.go();
  if (typeof r !== 'string') return; // a set piece that drives itself
  S.notes += a.n;
  const ev = Math.random() < .55 ? deal(ISLE_EVENTS) : null;
  let html = r + `<p class="fx">+${a.n} notes</p>`;
  if (ev) { html += `<h3 style="font-family:Rye,serif;font-weight:normal;color:var(--red);margin:14px 0 0">${ev.t}</h3><p>${ev.b}</p>` + fx(ev.fx); if (ev.notes) { S.notes += ev.notes; html += '<p class="fx">+1 note</p>'; } if (ev.flag) S.flags[ev.flag] = 1; }
  outcome(a.t, html, () => isleHub());
}
function writeUnion() {
  const n = Math.min(3, S.notes); S.notes -= n; S.letters++; S.pday++; S.day++;
  const r = Math.round(n * 11 * rnd(.85, 1.2) * (has('notebook') ? 1.1 : 1) * (S.flags.harte ? 1.1 : 1));
  log(`Sent letter no. ${S.letters} to the Union.`);
  outcome(`Letter no. ${S.letters}`, `<p>${pick(['You write all day at a table on the veranda, in your shirtsleeves, with a pitcher of lemonade and a lizard for company.', 'You write it in one sitting, from breakfast to supper, and it is the best thing you have done in months.', 'You fill twenty pages and send them off by the next ship. In Sacramento, they will set it in type and the whole coast will read it at breakfast a month from now.'])}</p>` + fx({ money: 20, readers: r, sp: 3 }), () => isleHub());
}
function sailTo(k) {
  S.pday += 2; S.day += 2; S.money -= 10; S.isle = k;
  scene.set('ocean', { schooner: true });
  outcome(`To ${ISLES[k].name}`, `<p>${pick(['The inter-island schooner is small, crowded and smells powerfully of oranges, pigs and sugar. Everyone aboard is seasick except the pigs.', 'You sleep on deck among sacks of potatoes and a family going to visit relatives, who share their dinner with you and laugh at your seasickness, kindly.', 'A long night rolling in the channel between the islands, and at dawn a new coast, green and black, with the surf breaking white along it.'])}</p>` + fx({ hp: -4, money: 0 }), () => isleHub());
}

function volcano() {
  scene.set('volcano', {});
  show({
    title: 'Kilauea', where: 'The volcano house, on the rim of the crater, after dark',
    body: `<p>You ride up through forest and fern into a strange country of cracked black lava, steaming vents and sulphur, to a grass-roofed hotel on the very rim of the crater. And at nightfall you go out and look over the edge.</p><p>Below you lies a pit nine miles round and a thousand feet deep, its floor a vast black plain cracked across and across with rivers of fire. In the middle the lake of fire itself is boiling: a great red cauldron flinging up fountains of molten lava that splash and fall in showers of light, while the glow on the clouds overhead turns the night to a red day. You can read your notebook by it, a mile away.</p>`,
    choices: [
      { t: 'Climb down to the crater floor with a guide', go: () => { S.flags.volcano = 2; S.notes += 4; feat('Walked on the floor of Kilauea'); return `<p>At midnight, with a lantern and a guide, you climb down the cliff and walk out across the crust of the crater floor. It is warm through your boots. Through the cracks you can see the fire running underneath, a foot down, like the inside of a stove. At the edge of the lake you stand in the glare with your face scorching and watch the fountains rise and fall, and the guide, who is not afraid of anything, quietly tells you to step back. You do not argue.</p>` + fx({ sp: 18, hp: -8 }) + '<p class="fx">+4 notes</p>'; } },
      { t: 'Watch from the rim all night', go: () => { S.flags.volcano = 1; S.notes += 3; return `<p>You sit on the rim wrapped in a blanket until dawn, watching the fire move and change below you, and do not once think about the stock market. It is the most magnificent thing you have ever seen, and you have seen the Washoe Zephyr.</p>` + fx({ sp: 15 }) + '<p class="fx">+3 notes</p>'; } },
    ],
  }, () => isleHub());
}
function haleakala() {
  scene.set('summit', {});
  show({
    title: 'Haleakala', where: 'Ten thousand feet up, before dawn',
    body: `<p>You ride up the long slope of Haleakala all afternoon, sleep, or try to, in a stone pen near the summit with the wind howling and the cold coming up out of the ground, and get up at four to see the sun rise.</p><p>The crater of the great mountain lies below you: a gulf twenty miles round and two thousand feet deep, with cinder cones standing in it like pyramids. And as the sky goes grey, you see that the clouds have come in beneath you and filled the whole world from edge to edge, a white, silent sea of cloud with the peaks standing out of it like islands.</p>`,
    choices: [
      { t: 'Wait for the sun', go: () => { S.flags.haleakala = 1; S.notes += 3; feat('Saw the sunrise from Haleakala'); return `<p>The sun comes up. The sea of cloud goes pink, then gold, then blinding white; the shadows of the cinder cones stretch out for miles across the crater floor; and for a quarter of an hour you forget that you are cold, or tired, or a newspaperman. It is the most sublime spectacle you have ever witnessed, and you write that down, and then cross it out because it is not enough.</p>` + fx({ sp: 18, hp: -4 }) + '<p class="fx">+3 notes</p>'; } },
      { t: 'Roll boulders into the crater with the others', go: () => { S.flags.haleakala = 1; S.notes += 2; return `<p>While waiting for the sun, you and your companions amuse yourselves by rolling great boulders off the rim and watching them bound down two thousand feet into the crater, raising dust like cannon shot. It is the kind of thing grown men do on mountains. Then the sun comes up and makes you ashamed of it.</p>` + fx({ sp: 14, hp: -2 }) + '<p class="fx">+2 notes</p>'; } },
    ],
  }, () => isleHub());
}
function hornet() {
  S.flags.hornet = 1;
  scene.set('island', { harbor: true });
  show({
    title: 'The Hornet', where: 'Honolulu, June 1866',
    body: `<p>News runs through the town: fifteen men have come ashore on the island of Hawaii in an open boat, the last survivors of the clipper <i>Hornet</i>, which burned at sea six weeks ago. They have been forty-three days in the boat on ten days’ rations. They are being brought to Honolulu now.</p>
      <p>It is the biggest story in the Pacific, and every paper in San Francisco would give its eye teeth for it. And you ${S.flags.boils ? 'cannot walk: your saddle boils have put you flat on your back' : 'are laid up with a fever and can hardly stand'}. A ship sails for San Francisco tomorrow morning.</p>`,
    choices: [
      { t: 'Have yourself carried to the hospital on a cot', go: () => { S.notes += 2; feat('Got the Hornet scoop'); addBonus(50); log('Scooped the Hornet story.'); return `<p>Anson Burlingame, the American minister to China, who is passing through and has taken a liking to you, has you carried to the hospital on a cot and helps you interview the survivors. They tell you everything: the fire, the boats, the hunger, the captain who kept the log and kept them alive. You write all day and all night without stopping, and at dawn your bundle of pages is flung aboard the schooner just as she casts off.</p><p>It is the first full account to reach the United States. The <i>Union</i> prints it across three columns and pays you ten times your rate. Overnight, you are the man who got the <i>Hornet</i> story.</p>` + fx({ readers: 90, money: 300, hp: -6, sp: 15 }); } },
      { t: 'Rest, and let the other correspondents have it', go: () => `<p>You rest. The story goes to San Francisco in someone else’s pocket. It is the sensible thing to do, and you never quite forgive yourself.</p>` + fx({ hp: 10, sp: -12 }) },
    ],
  }, () => isleHub());
}

function sailHome(forced) {
  S.act = 'pacific'; S.isle = null; S.homeward = 1;
  scene.set('ocean', { schooner: true });
  const unwritten = S.notes;
  S.letters += Math.floor(unwritten / 3); // you write up what you can on the voyage home
  addBonus(S.letters * 6);
  setDate(1866, 8, 13);
  log(`Sailed home. ${S.letters} letters to the Union.`);
  outcome('Homeward', `<p>${forced ? 'Your time is up and your money nearly so.' : 'You have seen what you came to see.'} You sail for home on a slow sailing ship that takes three weeks and a half to cross the same sea the <i>Ajax</i> crossed in eleven days. The wind dies for days at a time. You spend them on deck ${unwritten ? `writing up your last ${unwritten} notes, ` : ''}watching the ocean change colour and thinking about money.</p>
    <p>${S.letters} letters to the <i>Union</i>. A name people now recognise up and down the coast. And no job, and nothing to live on, and no idea what to do next.</p>
    <p>A friend in San Francisco says: why not give a lecture about the islands? You have never given a lecture in your life.</p>`, () => lecture());
}

// =============================================================== FINALE: THE LECTURE
// Everything you did in the game becomes material. Pick four bits, and how to tell each one.
const BITS = [
  { id: 'dict', n: 'The Unabridged Dictionary on the Overland stage', v: 6, if: () => S.flags.ev_dict },
  { id: 'slade', n: 'Coffee with Slade the desperado', v: 9, if: () => S.flags.slade },
  { id: 'buffalo', n: 'Bemis and the tree-climbing buffalo', v: 8, if: () => S.flags.ev_buffalo },
  { id: 'coyote', n: 'The coyote and the town dog', v: 7, if: () => S.flags.ev_coyote },
  { id: 'jack', n: 'The jackass rabbit', v: 5, if: () => S.flags.ev_jack },
  { id: 'zephyr', n: 'The Washoe Zephyr', v: 6, if: () => true },
  { id: 'plug', n: 'The Genuine Mexican Plug', v: 8, if: () => S.flags.plug },
  { id: 'blind', n: 'Millionaire for ten days', v: 9, if: () => S.flags.blind && !S.flags.rich },
  { id: 'rich', n: 'The blind lead, and how you kept it', v: 4, if: () => S.flags.rich },
  { id: 'tahoe', n: 'How you set fire to Lake Tahoe', v: 8, if: () => S.flags.tahoe && !S.flags.timber },
  { id: 'snow', n: 'Fifteen steps from the station', v: 9, if: () => S.flags.snow },
  { id: 'duel', n: 'The duel that never happened', v: 8, if: () => S.flags.duel },
  { id: 'petrified', n: 'The petrified man', v: 7, if: () => (S.usedLeads || []).includes('petrified') },
  { id: 'crash', n: 'Rich on Monday, a pauper by Friday', v: 7, if: () => S.flags.ruined },
  { id: 'quake', n: 'The earthquake on Third Street', v: 7, if: () => S.flags.quake },
  { id: 'tom', n: 'Tom Quartz, the cat who disapproved of quartz mining', v: 9, if: () => S.flags.tomquartz },
  { id: 'frog', n: 'The jumping frog of Calaveras County', v: 10, if: () => S.flags.frogHeard },
  { id: 'admiral', n: 'The Old Admiral meets his match', v: 7, if: () => S.flags.admiral },
  { id: 'horse', n: 'The Honolulu horse that only went home', v: 8, if: () => S.flags.horse },
  { id: 'surf', n: 'Surf-bathing, and how it bathed you', v: 7, if: () => S.flags.surf },
  { id: 'bugs', n: 'Centipedes, scorpions and other bedfellows', v: 6, if: () => S.flags.bugs },
  { id: 'volcano', n: 'A night at the volcano', v: 4, serious: true, if: () => S.flags.volcano },
  { id: 'sun', n: 'Sunrise on Haleakala', v: 3, serious: true, if: () => S.flags.haleakala },
  { id: 'hornet', n: 'Forty-three days in an open boat: the Hornet', v: 3, serious: true, if: () => S.flags.hornet },
  { id: 'cook', n: 'Where Captain Cook fell', v: 3, serious: true, if: () => S.done && S.done.includes('cook') },
];
const DELIVERY = [
  { k: 'dead', n: 'deadpan', sub: 'grave, slow, as if you had no idea it was funny', m: [1.15, 1.5] },
  { k: 'grin', n: 'with a grin', sub: 'let them see you enjoying it', m: [.6, 1.1] },
  { k: 'pause', n: 'with a long pause before the end', sub: 'risky: wait until the silence aches', m: [.5, 1.8] },
];
function lecture() {
  S.act = 'lecture'; setDate(1866, 10, 2);
  scene.set('hall', {});
  show({
    title: 'The trouble begins at eight', where: 'San Francisco, October 2, 1866',
    body: `<p>You rent the biggest hall in the city, Maguire’s Academy of Music, for fifty dollars, half of it borrowed. You have handbills printed and posted all over town, announcing a lecture on the Sandwich Islands by Mark Twain, and closing with a line you are rather proud of: <b>Doors open at 7 o’clock. The trouble will begin at 8.</b></p>
      <p>Then you spend three days in a cold sweat, convinced that nobody will come, or worse, that they will come and not laugh.</p>`,
    choices: [
      { t: 'Plant friends in the audience to laugh on your signal', sub: 'insurance; also a risk', go: () => { S.flags.claque = 1; return `<p>You arrange with some large friends from the mines to sit in the parquet and laugh when you look at them, and with a kind lady in a box to laugh whenever you turn your head towards her, whether the joke is good or not. You feel safer. Slightly.</p>`; }, next: lectureBits },
      { t: 'Trust the material', go: () => `<p>You decide that if the stories are good, they will laugh, and if they are not, you deserve it. This is a very brave decision and you regret it hourly.</p>` + fx({ sp: -4 }), next: lectureBits },
    ],
  });
}
function lectureBits() {
  const avail = BITS.filter(b => b.if());
  const chosen = [];
  const render = () => {
    const step = chosen.length;
    if (step === Math.min(4, avail.length)) return performLecture(chosen);
    const left = avail.filter(b => !chosen.some(c => c.b.id === b.id));
    page.innerHTML = `<h2>Backstage</h2><p class="where">Choose bit ${step + 1} of ${Math.min(4, avail.length)}, and how to tell it. Everything you lived through on this trip is material.</p>
      ${chosen.length ? `<p>So far: ${chosen.map(c => `<i>${c.b.n}</i> (${c.d.n})`).join(', ')}.</p>` : `<p>The hall is filling. You can hear them through the curtain: a great murmuring crowd, all the way up to the gallery. Your knees have opinions.</p>`}
      ${left.map(b => `<div class="lead"><b>${b.n}</b>${b.serious ? ' <small>(a serious one)</small>' : ''}<div class="emb">${DELIVERY.map(d => `<button class="btn" data-b="${b.id}" data-d="${d.k}" title="${d.sub}">${d.n}</button>`).join('')}</div></div>`).join('')}
      <p class="foot">Deadpan is the old Western way: tell it gravely and never let on. A pause before the end can bring the house down or leave it baffled. A serious piece in the middle makes the next laugh bigger. End on your best.</p>`;
    page.querySelectorAll('[data-b]').forEach(btn => btn.onclick = () => { sfx('click'); chosen.push({ b: avail.find(x => x.id === btn.dataset.b), d: DELIVERY.find(x => x.k === btn.dataset.d) }); render(); });
  };
  render();
}
function performLecture(chosen) {
  scene.set('hall', { lit: true });
  let total = 0, prevSerious = false; const lines = [];
  chosen.forEach((c, i) => {
    let v = c.b.v * rnd(...c.d.m);
    if (c.b.serious) { v = c.b.v * 1.2; lines.push(`<p><b>${c.b.n}.</b> The hall goes perfectly still. You can hear the gas jets hiss. When you finish there is a long silence, and then a great warm wave of applause.</p>`); }
    else {
      if (prevSerious) v *= 1.35;
      if (i === chosen.length - 1 && c.b.v >= 8) v *= 1.3;
      if (S.flags.claque && Math.random() < .25) { v *= .7; lines.push(`<p><b>${c.b.n}.</b> You glance at the lady in the box to cue her, at a perfectly solemn moment, and she laughs on cue, a great ringing laugh, and the whole house laughs at her, and you, and then at the story, though not quite in the right place.</p>`); }
      else lines.push(`<p><b>${c.b.n}.</b> ${v > 11 ? 'The house comes apart. Men in the gallery hold on to each other. A gentleman in the front row laughs until he has to be helped out.' : v > 8 ? 'A big laugh, rolling up from the parquet to the gallery and back down again.' : v > 5 ? 'A good laugh, and a few people repeat the last line to each other.' : 'A polite ripple. Somebody coughs. You press on.'}</p>`);
    }
    prevSerious = !!c.b.serious; total += v;
  });
  const laughs = Math.round(total);
  const take = Math.round(400 + laughs * 22);
  addBonus(laughs * 4);
  if (laughs >= 34) feat('Brought the house down');
  sfx('fanfare');
  outcome('Mark Twain, lecturer', `<p>You walk out onto the stage in front of fifteen hundred people. Your mouth is dry, your hands are cold and the first thing you say comes out as a croak. Then they laugh at the croak, and you are all right.</p>${lines.join('')}
    <p>When it is over the applause goes on so long you do not know whether to bow, leave or start again. The box office takes in <b>${money(take)}</b>. The next morning every paper in the city says the same thing in different words: there has never been anything quite like it.</p>
    <p>You have found what you were for. It only took a stagecoach, a silver mine, two newspapers, a frog, a volcano and five years.</p>` + fx({ money: take - 50, readers: laughs * 3, sp: 20 }), () => ending('lecture'));
}

window.EXTRA_ENDINGS = {
  lecture: ['The trouble began at eight', `<p>From San Francisco you take the lecture on the road, to Sacramento, to the mining towns, and back over the Sierra to Virginia City, where they turn out to cheer one of their own. Then East, and a trip around the world on a steamship full of pilgrims, and a book about that, and at last, sitting at a desk in Hartford with a box of old notebooks, a book about the West, the stage, the silver, the islands: <i>Roughing It</i>.</p><p>You leave out nothing important, and put in a great many things that are better than the truth.</p>`],
};

// =============================================================== scenes for Parts II & III
// Drawn with the sprite helpers in art.js (window.ART). Each scene paints on top of the shared
// sky/mountains/ground background described by its palette.
const A = window.ART;
const church = () => A.spr('church', 26, 46, x => {
  A.rect(x, 4, 22, 18, 24, '#f4f4ee'); A.poly(x, [[2, 23], [13, 14], [24, 23]], '#8a3a2a');
  A.rect(x, 10, 6, 6, 16, '#f4f4ee'); A.poly(x, [[9, 7], [13, 0], [17, 7]], '#8a3a2a'); A.rect(x, 12, 9, 2, 3, '#3a2616');
  A.rect(x, 11, 34, 4, 12, '#5a3a22'); A.rect(x, 6, 27, 3, 5, '#2e3a48'); A.rect(x, 17, 27, 3, 5, '#2e3a48');
}, '#2a1d12');
const hut = v => A.spr('hut' + v, 24, 18, x => {
  A.poly(x, [[0, 8], [12, 0], [24, 8]], v % 2 ? '#b8a060' : '#a08848'); for (let i = 2; i < 22; i += 3) A.rect(x, i, 3 + Math.abs(12 - i) * .4, 1, 5, '#8a7438');
  A.rect(x, 3, 8, 18, 10, v % 2 ? '#e8e4d8' : '#c8b890'); A.rect(x, 10, 11, 4, 7, '#3a2616');
}, '#2a1d12');
const canoe = () => A.spr('canoe', 30, 10, x => {
  A.poly(x, [[0, 5], [28, 5], [25, 8], [3, 8]], '#5a3a22'); A.rect(x, 4, 1, 20, 1, '#7a5a3a'); A.rect(x, 8, 1, 1, 5, '#7a5a3a'); A.rect(x, 20, 1, 1, 5, '#7a5a3a');
  A.rect(x, 12, 0, 3, 5, '#a0522d'); A.rect(x, 12, -1, 3, 2, '#2a1d12');
}, '#1e140c');
const cat = () => A.spr('cat', 9, 6, x => { A.ell(x, 4, 3.5, 3.2, 2, '#8a8a8a'); A.circ(x, 7, 2.4, 1.6, '#8a8a8a'); A.poly(x, [[6, 1.6], [6.4, 0], [7.2, 1.2]], '#8a8a8a'); A.rect(x, 0, 2, 1, 2, '#8a8a8a'); }, '#3a3a3a');
function puff(g, x, y, t, col, n = 6, rise = 26) {
  for (let i = 0; i < n; i++) { const a = (t * .4 + i / n) % 1; g.globalAlpha = (1 - a) * .7; g.fillStyle = col; g.beginPath(); g.arc(x + a * 10 + Math.sin(a * 6 + i) * 2, y - a * rise, 1.5 + a * 4, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
const sfHill = x => 30 * Math.exp(-(((x - 236) / 58) ** 2)) + 18 * Math.exp(-(((x - 120) / 44) ** 2));

Object.assign(window.SCENES, {
  sf: {
    pal: { sky: ['#94b6d2', '#ece4d0'], far: '#7f8a7e', mid: '#5a86a8', ground: '#a89a7c', dot: '#7a7a5a', lake: true, noprops: true },
    draw(g, t, px, o) {
      const shake = o.quake ? Math.round(Math.sin(t * 34) * 2) : 0;
      // the hills the city climbs
      for (let x = 70; x < 320; x++) { const h = Math.round(sfHill(x)); g.fillStyle = '#9a8a6a'; g.fillRect(x, 104 - h, 1, h + 14); }
      // rows of painted houses up the hills
      for (let row = 2; row >= 0; row--) for (let x = 64 + row * 7; x < 324; x += 17) {
        const base = 112 - Math.round(sfHill(x + 8) * (1 - row * .22)) - row * 9;
        g.drawImage(A.victorian(Math.floor(A.hash(x * 3 + row) * 5) + row), x + (row % 2 ? shake : -shake), base - 40);
      }
      // the waterfront: brick blocks and a wharf with ships
      g.fillStyle = '#6a5038'; g.fillRect(0, 103, 70, 3); for (let x = 2; x < 70; x += 6) g.fillRect(x, 106, 2, 6);
      g.drawImage(A.schooner(), 4 + Math.round(Math.sin(t * .8)), 58);
      for (let i = 0; i < 4; i++) { const b = A.brick(i + 2, ['', 'HOTEL', 'BANK', ''][i]); g.drawImage(b, 66 + i * 33 + shake, 120 - b.height); }
      if (o.press) { const b = A.brick(9, 'MORNING CALL', 52); g.drawImage(b, 236, 122 - b.height); }
      // the afternoon fog coming in through the Gate
      const fog = o.fog ? .75 : .38 + .18 * Math.sin(t * .15);
      for (let i = 0; i < 12; i++) { const y = 46 + i * 5, x = ((t * (5 + i % 3) + i * 53) % 420) - 90; g.fillStyle = `rgba(242,242,238,${fog * (1 - i / 16)})`; g.fillRect(Math.round(x), y, 110, 4); g.fillRect(Math.round(x) + 14, y - 2, 70, 2); }
    },
  },
  hill: {
    pal: { sky: ['#8ec0e0', '#eef2da'], far: '#7f9a6a', mid: '#6f8f4f', ground: '#a8a060', dot: '#5f7a3f', hills: true, noprops: true, noroad: true },
    draw(g, t, px, o) {
      for (const [x, y, v] of [[6, 100, 0], [48, 96, 1], [96, 102, 2], [140, 97, 3], [272, 99, 4], [300, 104, 5]]) g.drawImage(A.oak(v), x, y - 22);
      const c = A.cabin(2); g.drawImage(c, 186, 120 - c.height); puff(g, 222, 88, t, '#d8d4cc');
      g.drawImage(cat(), 190, 113);
      // a wash pan and a rocker by the creek
      g.fillStyle = '#6a8ab0'; g.fillRect(0, 130, 320, 3); g.fillStyle = '#9ab4d0'; for (let x = 0; x < 320; x += 9) g.fillRect((x + Math.round(t * 6)) % 320, 130, 3, 1);
      g.fillStyle = '#5a3f25'; g.fillRect(120, 124, 12, 5); g.fillStyle = '#8a8a8a'; g.fillRect(140, 127, 7, 2);
      for (const [x, y, v] of [[30, 150, 6], [250, 152, 7]]) g.drawImage(A.oak(v), x, y - 22);
      if (o.tavern) { g.fillStyle = 'rgba(170,190,210,.6)'; for (let i = 0; i < 120; i++) g.fillRect((i * 37 + t * 24) % 320, (i * 53 + t * 110) % 160, 1, 4); }
    },
  },
  ocean: {
    pal: { sky: ['#6aa8d8', '#eaf2f0'], far: '#4f86ad', mid: '#3a76a4', ground: '#2f6592', dot: '#4f86ad', flat: true },
    draw(g, t, px, o) {
      const bob = Math.round(Math.sin(t * 1.3) * 1.5);
      if (o.steamer) { const s = A.steamer(); g.drawImage(s, 110, 70 + bob); puff(g, 162, 72 + bob, t, '#5a5048', 7, 34); }
      if (o.schooner) g.drawImage(A.schooner(), 128, 76 + bob);
      // gulls and the odd flying fish
      for (let i = 0; i < 3; i++) { const x = ((t * (18 + i * 5) + i * 120) % 360) - 20, y = 30 + i * 9 + Math.sin(t * 2 + i) * 3, w = Math.sin(t * 8 + i) > 0; g.fillStyle = '#2a2a2a'; g.fillRect(Math.round(x), Math.round(y), 1, 1); g.fillRect(Math.round(x) - 2, Math.round(y) - (w ? 1 : 0), 2, 1); g.fillRect(Math.round(x) + 1, Math.round(y) - (w ? 1 : 0), 2, 1); }
      if (Math.sin(t * .7) > .5) { const fx = ((t * 70) % 380) - 30, fy = 128 - Math.abs(Math.sin(t * 5)) * 8; g.fillStyle = '#d8e8f0'; g.fillRect(Math.round(fx), Math.round(fy), 4, 1); g.fillRect(Math.round(fx) + 1, Math.round(fy) - 1, 2, 1); }
    },
  },
  island: {
    pal: { sky: ['#56a2dc', '#f2f4e2'], far: '#3f7a4a', mid: '#2aa0b4', ground: '#ecdcaa', dot: '#7fb04a', lake: true, noprops: true, noroad: true },
    draw(g, t, px, o) {
      if (o.mountain) {
        A.poly(g, [[40, 92], [120, 40], [168, 30], [220, 42], [300, 92]], '#4e6a52');
        A.poly(g, [[168, 30], [220, 42], [300, 92], [200, 92]], '#5f7d60');
        g.fillStyle = '#7a8a7a'; g.fillRect(150, 30, 26, 2);
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(40,70,46,.6)'; g.fillRect(60 + (i * 37) % 220, 70 + (i * 13) % 20, 2, 1); }
      }
      // reef surf and the beach edge
      for (let x = 0; x < 320; x++) { const w = Math.sin(x * .12 + t * 2) + Math.sin(x * .05 - t); if (w > .9) { g.fillStyle = '#ffffff'; g.fillRect(x, 92 + (w > 1.5 ? 0 : 1), 1, 1); } }
      g.fillStyle = 'rgba(255,255,255,.85)'; for (let x = 0; x < 320; x += 2) g.fillRect(x, 103 + Math.round(Math.sin(x * .2 + t * 3)), 2, 1);
      g.drawImage(canoe(), Math.round(((t * 6) % 380) - 40), 92);
      if (o.harbor) {
        g.fillStyle = '#6a5038'; g.fillRect(118, 100, 46, 3); for (let x = 120; x < 164; x += 6) g.fillRect(x, 103, 2, 6);
        g.drawImage(church(), 180, 120 - 46); g.drawImage(hut(0), 210, 102); g.drawImage(hut(1), 236, 104); g.drawImage(hut(2), 150, 106);
        g.drawImage(A.schooner(), 92, 56);
      } else { g.drawImage(hut(1), 200, 104); g.drawImage(hut(2), 226, 106); }
      for (const [x, v] of [[2, 0], [44, 1], [262, 2], [290, 3]]) { const sway = Math.round(Math.sin(t * 1.1 + x) * 1); g.drawImage(A.palm(v), x + sway, 154 - 44); }
    },
  },
  volcano: {
    pal: { sky: ['#120a12', '#4a1a14'], far: '#1a1210', mid: '#2a1612', ground: '#1e1614', dot: '#3a2016', night: true, noprops: true, noroad: true, flat: true },
    draw(g, t) {
      // glow on the underside of the sky
      for (let y = 40; y < 100; y++) { const a = (y - 40) / 60 * .45; if (a > 0) { g.fillStyle = `rgba(255,${80 + y}, 30,${a * .6})`; g.fillRect(0, y, 320, 1); } }
      // crater walls and the black floor
      g.fillStyle = '#140c0a'; g.fillRect(0, 96, 320, 64);
      A.poly(g, [[0, 96], [0, 70], [40, 74], [70, 86], [90, 98]], '#22140f'); A.poly(g, [[320, 96], [320, 66], [270, 72], [240, 86], [226, 98]], '#22140f');
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,${90 + (i % 5) * 20},30,${.35 + (i % 3) * .15})`; const x = (i * 53) % 320, y = 132 + (i * 11) % 26; g.fillRect(x, y, 6 + (i % 4) * 3, 1); }
      // the lake of fire
      for (let x = 70; x < 250; x++) {
        const edge = 6 * Math.sqrt(Math.max(0, 1 - ((x - 160) / 90) ** 2));
        for (let y = Math.round(116 - edge); y < 116 + edge; y++) {
          const v = Math.sin(x * .25 + t * 3 + y) + Math.sin(x * .07 - t * 1.4) + A.h2((x + t * 12) | 0, y) * .8;
          g.fillStyle = v > 1.5 ? '#fff0a0' : v > .7 ? '#ffb040' : v > -.4 ? '#ff6a20' : '#b82a10'; g.fillRect(x, y, 1, 1);
        }
      }
      for (let i = 0; i < 40; i++) { const ph = (t * 1.2 + i * .37) % 2, x = 110 + (i * 37) % 100, y = 112 - Math.sin(ph / 2 * Math.PI) * (16 + i % 5 * 9); g.fillStyle = ph < 1 ? '#fff0a0' : '#ff6a20'; g.fillRect(Math.round(x + ph * 4), Math.round(y), 2, 2); }
      // the Volcano House on the rim, with a lamp lit
      const c = A.cabin(3); g.drawImage(c, 12, 74 - c.height + 14); g.fillStyle = '#ffd070'; g.fillRect(19, 76, 6, 4);
    },
  },
  summit: {
    pal: { sky: ['#283a6e', '#f6be86'], far: '#4a3e52', mid: '#e8e2e0', ground: '#6a4a40', dot: '#8a6a58', lowsun: true, noprops: true, noroad: true, hills: true, noclouds: true },
    draw(g, t) {
      // Mauna Kea and Mauna Loa standing out of the clouds, far across the channel
      A.poly(g, [[200, 82], [236, 62], [262, 60], [300, 82]], '#3a3048'); A.poly(g, [[250, 84], [286, 70], [320, 74], [320, 84]], '#423650');
      g.fillStyle = '#f0ece8'; g.fillRect(234, 62, 30, 2);
      // the sea of clouds below the summit
      for (let i = 0; i < 26; i++) g.drawImage(A.cloud(i % 6), Math.round(((i * 23 + t * 1.5) % 360) - 30), 72 + (i % 4) * 5);
      g.fillStyle = '#f4f0ee'; g.fillRect(0, 92, 320, 12);
      // the crater: red-brown cinder cones in a vast floor
      g.fillStyle = '#5a3e36'; g.fillRect(0, 104, 320, 56);
      for (let i = 0; i < 4; i++) { const x = 40 + i * 70, h = 20 + (i % 2) * 8; A.poly(g, [[x, 146], [x + 18, 146 - h], [x + 26, 146 - h], [x + 44, 146]], '#8a4a36'); A.poly(g, [[x + 26, 146 - h], [x + 44, 146], [x + 30, 146]], '#a85a40'); }
      g.fillStyle = '#3a2a24'; g.fillRect(0, 150, 320, 10);
      for (let i = 0; i < 6; i++) { const x = ((t * 3 + i * 60) % 340) - 10; g.fillStyle = 'rgba(255,230,200,.25)'; g.fillRect(Math.round(x), 96 + i, 40, 1); }
    },
  },
  hall: {
    pal: { sky: ['#2a1410', '#4a2418'], far: '#3a1a14', mid: '#5a2418', ground: '#2a1a12', dot: '#2a1a12', night: true, noprops: true, noroad: true, flat: true },
    draw(g, t, px, o) {
      g.fillStyle = '#4a1612'; g.fillRect(0, 0, 320, 160);
      for (let x = 0; x < 320; x += 6) { g.fillStyle = x % 12 ? '#8a2418' : '#7a1c12'; g.fillRect(x, 0, 6, 22); g.fillStyle = '#c9a040'; g.fillRect(x + 2, 20, 2, 2); }
      for (let x = 0; x < 46; x += 4) { const c = x % 8 ? '#8a2418' : '#6a1810'; g.fillStyle = c; g.fillRect(x, 0, 4, 112); g.fillRect(316 - x, 0, 4, 112); }
      g.fillStyle = '#c9a040'; g.fillRect(0, 0, 320, 3); g.fillRect(46, 22, 228, 1);
      // gaslight on the backdrop
      const lit = o.lit || o.applause;
      g.fillStyle = lit ? 'rgba(255,210,140,.18)' : 'rgba(255,210,140,.06)'; g.beginPath(); g.ellipse(160, 70, 90, 50, 0, 0, 7); g.fill();
      // the stage, footlights, lectern and the lecturer in his white suit... well, dark coat
      g.fillStyle = '#6a4a2a'; g.fillRect(30, 92, 260, 18); g.fillStyle = '#7a5a34'; for (let x = 30; x < 290; x += 10) g.fillRect(x, 92, 1, 18); g.fillStyle = '#c9a040'; g.fillRect(30, 90, 260, 2);
      for (let i = 0; i < 12; i++) { g.fillStyle = lit ? `rgba(255,220,140,${.7 + .3 * Math.sin(t * 5 + i)})` : '#806040'; g.fillRect(40 + i * 21, 87, 4, 3); }
      g.fillStyle = '#3a2616'; g.fillRect(172, 64, 14, 26); g.fillStyle = '#4a3520'; g.fillRect(168, 62, 22, 4); g.fillStyle = '#efe3c4'; g.fillRect(172, 60, 8, 2);
      const gest = Math.sin(t * 1.5) > .3 && lit;
      g.fillStyle = '#1a1414'; g.fillRect(152, 56, 11, 34); g.fillStyle = '#e0c08a'; g.fillRect(153, 45, 9, 10); g.fillStyle = '#cfcfcf'; g.fillRect(152, 42, 11, 4); g.fillRect(151, 44, 2, 6);
      g.fillStyle = '#5a3a2a'; g.fillRect(155, 54, 5, 2); g.fillStyle = '#f0f0f0'; g.fillRect(155, 56, 5, 3);
      g.fillStyle = '#1a1414'; g.fillRect(gest ? 162 : 162, gest ? 50 : 60, 3, gest ? 8 : 10); g.fillStyle = '#e0c08a'; g.fillRect(gest ? 163 : 162, gest ? 48 : 70, 2, 2);
      // the audience, heads bobbing when they laugh
      const hats = ['#1a0f0c', '#2a1810', '#3a2416', '#5a3a2a', '#24140e'];
      for (let r = 0; r < 4; r++) for (let i = 0; i < 27; i++) {
        const x = 2 + i * 12 + r * 3 - (r % 2) * 6, y = 118 + r * 11, bob = o.applause || lit ? Math.round(Math.sin(t * (7 + i % 3) + i + r) * 1.2) : 0;
        g.fillStyle = r % 2 ? '#140a08' : '#1c0f0a'; g.fillRect(x, y + bob, 9, 9);
        g.fillStyle = '#3a2418'; g.fillRect(x + 2, y - 4 + bob, 5, 5);
        const hv = A.hash(i * 13 + r); if (hv < .4) { g.fillStyle = hats[i % 5]; g.fillRect(x + 1, y - 7 + bob, 7, 1); g.fillRect(x + 2, y - 9 + bob, 5, 2); } else if (hv < .6) { g.fillStyle = '#6a2a4a'; g.fillRect(x + 1, y - 6 + bob, 7, 2); g.fillRect(x + 5, y - 8 + bob, 3, 2); }
      }
    },
  },
});
