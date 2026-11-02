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
  westward: () => 'The road west',
  sf: () => 'San Francisco',
  pocket: () => 'Jackass Hill',
  pacific: () => S.isle ? ISLES[S.isle].name : 'At sea',
  lecture: () => 'Academy of Music',
};

// =============================================================== PART II: SAN FRANCISCO
const LODGING = {
  lick: { name: 'the Lick House', cost: 30, hp: 2, sp: 3, note: 'Velvet chairs, gaslight, and a dining room like a cathedral with a bill of fare. The feet in your pocket pay for it, for now.' },
  board: { name: 'a boarding house on Bush Street', cost: 12, hp: 0, sp: 0, note: 'Clean sheets, hash on Tuesdays and most other days, and a landlady with a memory for rent like a county clerk’s.' },
  garret: { name: 'a garret on Minna Street', cost: 4, hp: -3, sp: -3, note: 'A slanted ceiling, a cot, and a fine view of other people’s chimneys, which are the only warm things on Minna Street.' },
};

// =============================================================== THE ROAD WEST: Virginia City to San Francisco
// An overland leg of its own, trail-style: pick how to travel, then go a stage at a time over the
// Sierra by the Placerville road, down through the gold country to Folsom and the railroad cars,
// and down the river by night boat to the city. Landmarks have fixed events; between them the
// road deals from a table of mishaps, each at most once.
const WEST = [
  { mi: 0, k: 'vc', name: 'Virginia City' },
  { mi: 16, k: 'carson', name: 'Carson City', ev: 'carson' },
  { mi: 40, k: 'friday', name: 'Friday’s Station, on Lake Bigler', ev: 'bigler' },
  { mi: 58, k: 'summit', name: 'the summit of Johnson’s Pass', ev: 'summit' },
  { mi: 72, k: 'strawberry', name: 'Strawberry Station', ev: 'strawberry' },
  { mi: 110, k: 'placerville', name: 'Placerville, that used to be Hangtown', ev: 'placerville' },
  { mi: 136, k: 'folsom', name: 'Folsom, and the railroad', ev: 'folsom' },
  { mi: 158, k: 'sacramento', name: 'Sacramento City', ev: 'sacramento' },
];
const WEST_END = 158;
const MODES = {
  stage: { name: 'the Pioneer stage', fare: 40, step: [26, 36], wear: 1, note: 'Through to Sacramento in a Concord coach with six horses and a driver that would not slow down for the Day of Judgment. $40, and fast.' },
  wagon: { name: 'a freight wagon going down empty', fare: 10, step: [12, 18], wear: 2, note: 'A ten-mule team hauling empty to Placerville for another load. You ride on the seat with the teamster. $10, slow, and educational.' },
};
const westRegion = () => S.wmi < 100 ? 'sierraroad' : 'valley';
function westScene(extra = {}) { scene.set(westRegion(), S.wmode === 'stage' ? { coach: true, ...extra } : { freight: true, ...extra }); }

window.partTwo = function (kind) {
  S.act = 'westward'; S.wmi = 0; S.wkind = kind; S.wstep = 0; S.wstop = 0; S.trouble = 0;
  setDate(1864, 5, 28);
  log('Part II: lit out for San Francisco.');
  scene.set('city', {});
  partCard('II', 'San Francisco', 'May 1864 · the road west from Virginia City', `
    ${kind === 'duel' ? '<p>The new law against duelling being what it was, and the gentleman you had insulted in print being what he was, you and Steve Gillis concluded that the climate of Washoe had grown unhealthy, and resolved to try the climate of California, which was said to be good for the constitution and better for the liberty.</p>' : '<p>After eight issues of the <i>Enterprise</i> there was not a saloon on the Comstock where your name was not known and generally disputed. You concluded that you had exhausted Washoe, or it had exhausted you, which comes to the same, and that a man of your attainments was wasted on a town that had only one street that was level, and that one up-ended.</p>'}
    <p>San Francisco lay a hundred and sixty miles off as the stage goes, over the Sierra Nevada by the Placerville road, down through the old gold diggings, and then by railroad cars and river boat to the sea. It is a road that every teamster in California has an opinion about, and the opinions do not bear printing.</p>
    <blockquote>The road west, a stage at a time. Mind your health and your spirits; mind your purse at the stations; and do not let the driver tell you about Horace Greeley.</blockquote>`, () => westMode());
};

function westMode() {
  scene.set('city', {});
  show({
    title: 'How to go', where: 'C Street, Virginia City, the morning of departure',
    body: `<p>There are two ways down to Sacramento for a man of your means, which are not extensive. There is the Pioneer line, which is fast, and the freight teams, which are cheap, and there is a great deal of argument in the saloons as to which is the more dangerous.</p>`,
    choices: [
      ...Object.entries(MODES).map(([k, m]) => ({ t: `Go by ${m.name} · $${m.fare}`, sub: m.note, disabled: S.money < m.fare, go: () => { S.wmode = k; S.money -= m.fare; log(`Left Virginia City by ${m.name}.`); westDay(true); } })),
      { t: 'Walk beside a freight team and work your passage', sub: 'free; you are the swamper, and you help with the mules', if: () => S.money < 10, go: () => { S.wmode = 'wagon'; S.flags.swamper = 1; log('Walked out of Washoe working for a teamster.'); westDay(true); } },
    ],
  });
}

function westDay(first) {
  if (checkDeath()) return;
  S.act = 'westward';
  westScene();
  const next = WEST[S.wstop + 1], M = MODES[S.wmode];
  show({
    title: first ? 'Down the Geiger Grade and away' : `On the road west · day ${Math.floor(S.wstep / (S.wmode === 'stage' ? 2 : 1)) + 1}`,
    where: `${S.wmi} of ${WEST_END} miles to Sacramento · next: ${next ? `${next.name} (${next.mi - S.wmi} mi)` : 'the river'} · by ${M.name}`,
    body: first ? (S.wmode === 'stage'
      ? '<p>The driver gathered up his six lines, cut loose with the whip, and the coach went down the grade out of Virginia City at a gait that made the passengers grab for the straps and the Lord simultaneously. Behind you the smoke of the hoisting works stood up over Mount Davidson like the steam off a kettle of trouble. You did not look back long.</p>'
      : '<p>The teamster was a long, sorrowful Missourian named Coombs, who spoke to his mules in a language of his own invention and to people hardly at all. He looked you over, spat, said "Git up on the seat, then," and you got. The mules leaned into their collars, the empty wagon groaned, and you began to go to San Francisco at a speed that would have been considered reckless in a glacier.</p>')
      : `<p>${deal(WEST_FLAVOR[S.wmi < 100 ? 'mountain' : 'valley'])}</p>`,
    choices: [
      { t: S.wmode === 'stage' ? 'Roll on' : 'Plod on', sub: S.wmode === 'stage' ? 'about thirty miles before the next change of horses' : 'about fifteen miles, if the mules agree to it', go: westTravel },
      { t: S.seat === 'top' ? 'Climb down inside' : 'Ride up on the box with the driver', if: () => S.wmode === 'stage', sub: S.seat === 'top' ? 'out of the dust and the weather' : 'the view, the conversation, and the dust', go: () => { S.seat = S.seat === 'top' ? 'inside' : 'top'; westDay(); } },
      { t: 'Get down and walk the grade to spare the horses', if: () => S.wmi < 100, sub: 'harder on you, easier on your conscience', go: () => { S.wstep++; S.day += S.wstep % 2 ? 0 : 1; S.wmi = Math.min(WEST_END, S.wmi + 8); return '<p>You walked up the grade beside the team with your coat over your arm, and arrived at the top with a fine appetite, a moral glow, and a blister of the size and general character of a Washoe silver dollar.</p>' + fx({ hp: -3, sp: 6 }); }, next: () => westDay() },
      { t: 'Lay over at the station', sub: 'a bunk and two meals for $2, and a day lost', disabled: S.money < 2, go: () => { S.day++; return `<p>${pick(['You lay over a day at the station. The keeper fed you beef that had evidently been killed in self-defence, and a pie that had been made, as near as you could judge, out of the same beef. You slept twelve hours and rose a new man, with the old man’s appetite.', 'You took a day off at the station and sat on the porch watching the freight wagons crawl by. Every teamster that passed said good morning in a voice that would have stripped paint, and meant it kindly.'])}</p>` + fx({ hp: 10, sp: 5, money: -2 }); }, next: () => westDay() },
      { t: 'Take a dose of patent medicine', if: () => has('medicine') && S.hp < 70, go: () => '<p>It tasted of tar and good intentions, and it cured you of everything but the taste.</p>' + fx({ hp: 14, lose: 'medicine' }), next: () => westDay() },
    ],
  });
}

function westTravel() {
  const M = MODES[S.wmode];
  scene.roll(1500);
  S.wmi = Math.min(WEST_END, S.wmi + ri(...M.step));
  S.wstep++; if (S.wmode === 'wagon' || S.wstep % 2 === 0) S.day++;
  const d = { hp: -1 * M.wear, sp: -2 };
  if (S.seat === 'top' && S.wmode === 'stage') d.sp += 3;
  if (has('pipe')) d.sp += 2;
  if (S.wmi < 100 && !has('blankets') && !has('coat')) d.hp -= 2;
  const daily = fx(d);
  page.querySelectorAll('button').forEach(b => b.disabled = true);
  setTimeout(() => {
    const next = WEST[S.wstop + 1];
    if (next && S.wmi >= next.mi) { S.wstop++; S.wmi = Math.max(S.wmi, next.mi); log(`Reached ${next.name}.`); return WEV[next.ev](daily); }
    const pool = WEST_EV.filter(e => !S.flags['w_' + e.id] && (!e.if || e.if()));
    if (pool.length && Math.random() < .68) { const e = pick(pool); S.flags['w_' + e.id] = 1; return e.go(daily); }
    outcome('On the road', `<p>${deal(WEST_QUIET)}</p>` + daily, () => westDay());
  }, 1500);
}

const WEST_FLAVOR = {
  mountain: [
    'The road climbed through pines so tall that a man had to look twice to see the tops, and the second look generally cost him his hat.',
    'Every mile or so the road went round a shoulder of the mountain with a thousand feet of nothing on the outside of it, and the driver took every one of those corners as if he owed the canyon money and meant to pay it.',
    'The air up here was so thin and clear that you could see a teamster swearing two miles off, though mercifully you could not hear him till he got nearer.',
    'Snowbanks lay in the shade of the pines, in May, grey and sulky, like creditors who had been told to call again.',
  ],
  valley: [
    'Down out of the pines the country opened into rolling yellow hills with oaks standing about on them in the attitude of people waiting for a train.',
    'You passed through old diggings where every gulch had been turned inside out and washed and turned back again, and the only thing left in them now was the names: Mud Springs, Shingle Springs, Diamond Springs, and not a spring among them worth the mention.',
    'It grew hot. The dust rose up and sat in the coach with you like an extra passenger who had paid his fare and meant to have his money’s worth.',
  ],
};
const WEST_QUIET = [
  'An uneventful stretch, if you except the dust, the grade, the jolting and the conversation of a man from Ohio who had been to Washoe for nine days and understood it thoroughly.',
  'You counted freight wagons for an hour, going the other way, loaded to the sky with flour, whiskey, mining machinery and hope. You gave up at a hundred and eleven.',
  'Nothing happened for twenty miles, and you were grateful to it.',
  'You changed horses at a station where the keeper had a tame bear on a chain, and the bear had the better manners of the two.',
  'A passenger read aloud from a <i>Sacramento Union</i> a week old, war news and all. The news was old, but so was the passenger, and he enjoyed it.',
  'You dozed, and dreamed you were rich, and woke in a chuckhole and were not.',
];

// Fixed events at the landmarks
const WEV = {
  carson: daily => { westScene(); show({
    title: 'Carson City', where: 'A change of horses and a last look at Orion',
    body: `<p>At Carson you had time to run up to the Secretary’s office and shake hands with Orion, who was trying to make a Territory balance its books, which is a thing that has never yet been done by a Territory. He gave you a great deal of good advice and asked whether you needed money, in the tone of a man hoping very hard that you would say no.</p>${daily}`,
    choices: [
      { t: 'Say no, like a gentleman', go: () => '<p>You said no. Orion was so relieved that he gave you twenty dollars anyway, out of sheer gratitude, which was Orion all over, and always had been.</p>' + fx({ money: 20, sp: 6 }) },
      { t: 'Say yes, like a brother', go: () => '<p>You said yes. Orion turned out his pockets and found eleven dollars, a pencil, and a petition to Congress. You took the eleven dollars and left him the petition, which was worth about the same.</p>' + fx({ money: 11, sp: 2 }) },
    ] }, () => westDay()); },
  bigler: daily => { westScene({ lake: true }); outcome('Lake Bigler', `<p>The road came down to Friday’s Station on the shore of Lake Bigler, which the Californians are trying to call Lake Tahoe, and the lake lay there in the pines as blue as ever, and as indifferent to your troubles. You had dinner at the station, a dollar, and it was worth seventy-five cents.</p>${S.flags.tahoe && !S.flags.timber ? '<p>Across the water you could see a long black scar up the side of a mountain, where some fool had let a campfire get away from him. You looked at it with a sort of proprietary interest, and kept your mouth shut.</p>' : ''}` + fx({ money: -1, sp: 6, hp: 3 }) + daily, () => westDay()); },
  summit: daily => { westScene({ snow: true }); show({
    title: 'Johnson’s Pass', where: 'The summit, seven thousand feet up, in the last of the snow',
    body: `<p>Near the summit the road ran between banks of old snow higher than the coach, and turned to slush and mud in the middle, and the horses went in up to their bellies. The driver hauled up and announced that it would oblige him greatly if the gentlemen would get out and walk, and that it would oblige him still more if they would push.</p>${daily}`,
    choices: [
      { t: 'Get out and push with the rest', go: () => '<p>You pushed, with your boots full of snow-water and your opinion of the Sierra Nevada falling with every step. The coach came out of it, and so did you, about two hours older.</p>' + fx({ hp: -5, sp: 4 }) },
      { t: 'Keep your seat, and your dignity', go: () => Math.random() < .5 ? '<p>You kept your seat. The coach slewed sideways in the slush, hung a moment over the drop with one wheel spinning in the air, thought better of it, and came back. You kept your dignity too, though you could not have said afterwards where.</p>' + fx({ sp: -6 }) : '<p>You kept your seat while the others pushed, and they hated you with a fine, steady hatred the rest of the way to Strawberry, which you bore like a Christian.</p>' + fx({ sp: -3 }) },
    ] }, () => westDay()); },
  strawberry: daily => { westScene(); outcome('Strawberry Station', `<p>There are no strawberries at Strawberry. The station belonged once to a man named Berry, and the teamsters accused him of feeding their teams straw when they had paid for hay, and called him Straw Berry, and the name stuck to the place long after the straw and the hay and Berry were gone. That is how places get their names in this country, and most of them deserve it.</p><p>You had a dinner of beans and bacon and something the keeper called coffee, with great confidence.</p>` + fx({ hp: 4, sp: 3 }) + daily, () => westDay()); },
  placerville: daily => { westScene(); show({
    title: 'Placerville', where: 'Which was Hangtown, until it got respectable',
    body: `<p>Placerville was called Hangtown in the flush times, on account of the oak tree in the middle of town from which the citizens used to hang the people they disapproved of, with very little delay and no appeal. The tree is still there. It has a saloon built round it now, which is what happens to most institutions in California.</p>${daily}`,
    choices: [
      { t: 'Go and look at the tree', go: () => '<p>You looked at the stump of the hanging oak, in the saloon, and the saloon-keeper told you the history of every man that ever swung from it, with dates, until you began to suspect he had personally attended them all. You bought a drink to show you were not a horse thief.</p>' + fx({ sp: 5, money: -1 }) },
      { t: 'Telegraph the Call that you are coming', go: () => { S.flags.wired = 1; return '<p>You spent a dollar telegraphing ahead to the <i>Morning Call</i> that a reporter of Comstock experience was on his way and might be persuaded. The answer came back in an hour: COME AND SEE. It was not encouraging, but it was not a no.</p>' + fx({ money: -1, sp: 4 }); } },
    ] }, () => westDay()); },
  folsom: daily => { scene.set('valley', { train: true }); show({
    title: 'The railroad cars', where: 'Folsom, on the Sacramento Valley Railroad',
    body: `<p>At Folsom the road ran out and the railroad began, and you climbed aboard a train of yellow cars behind a little wood-burning engine with a smokestack like a funnel turned upside down. You had not been on the cars in four years. You had forgot what it was to go twenty-two miles in an hour without a horse in sight, and to be shaken in a straight line instead of a circle.</p>${S.wmode === 'wagon' ? '<p>You shook hands with Coombs the teamster, who said "Well," and spat, which for him was a speech.</p>' : ''}${daily}`,
    choices: [
      { t: 'Ride out on the platform', go: () => '<p>You rode the whole way on the platform between the cars, with your hat in your hand and the cinders in your eye, and the hot valley going by at a speed that took your breath and gave it back with soot in it. You arrived at Sacramento black as a sweep and as happy as a boy.</p>' + fx({ sp: 10, hp: -2, money: -1 }) },
      { t: 'Sit inside like a Christian', go: () => '<p>You sat inside on a plush seat and read a newspaper in a moving vehicle without once being thrown against the roof, which you had come to regard as impossible.</p>' + fx({ sp: 5, hp: 3, money: -1 }) },
    ] }, () => { S.wmi = Math.max(S.wmi, 150); westDay(); }); },
  sacramento: daily => { scene.set('river', {}); show({
    title: 'Sacramento City', where: 'The capital of California, built on stilts against the river',
    body: `<p>Sacramento is the capital, and the legislature sits there, and the river rises up every few years and sits there too. The town has raised its streets ten feet to get above the floods, and the effect is that half the houses have their front doors in the cellar.</p><p>At the levee the river steamer <i>Chrysopolis</i> lay with steam up: a great white palace of a boat, with a gilded saloon, a band, and a bar, bound down the river overnight to San Francisco. The fare was five dollars, or two in the steerage.</p>${daily}`,
    choices: [
      { t: 'A stateroom on the Chrysopolis · $5', disabled: S.money < 5, go: () => { S.money -= 5; S.flags.cabin = 1; riverNight(); } },
      { t: 'Deck passage among the freight · $2', disabled: S.money < 2, go: () => { S.money -= 2; riverNight(); } },
      { t: 'Stow away behind the cotton bales', if: () => S.money < 2, go: () => { S.flags.stowaway = 1; riverNight(); } },
    ] }); },
};

// Between the landmarks
const WEST_EV = [
  { id: 'freight', go: daily => { westScene(); show({
    title: 'The freight procession', body: `<p>The road over the Sierra in those days was one continuous procession of freight wagons going up to Washoe, each with a ten or twelve-mule team and a teamster whose language would have melted the bell off a church. The road was just wide enough for one wagon, and the stage met them on the corners, with the canyon on the outside.</p>${daily}`,
    choices: [
      { t: 'Look down into the canyon', go: () => '<p>You looked. It was a long way down, and at the bottom there was the wreck of a wagon, and some bones that you hoped were mules. You did not look again until Placerville.</p>' + fx({ sp: -4 }) },
      { t: 'Shut your eyes and trust the driver', go: () => '<p>You shut your eyes. The coach scraped by the freight wagon with an inch to spare on one side and the hereafter on the other, and the teamster and the driver exchanged remarks that you are still trying to forget.</p>' + fx({ sp: 4 }) },
    ] }, () => westDay()); } },
  { id: 'greeley', if: () => S.wmode === 'stage', go: daily => { westScene(); show({
    title: 'Horace Greeley, again', body: `<p>A passenger from the East leaned over, with the light of discovery in his eye, and asked whether you had ever heard about the time Hank Monk drove Horace Greeley over these very mountains. Greeley had a lecture to give at Placerville, you see, and was anxious about the time, and Monk said ...</p><p>You had heard it. You had heard it from drivers, station keepers, editors, ministers, a Mexican packer, a Dutch brewer and a deaf man. You had heard it four hundred and eighty-one times. The passenger was already drawing breath.</p>${daily}`,
    choices: [
      { t: 'Hear him out, politely', go: () => '<p>You heard him out. He came to the end, to "Keep your seat, Horace, I’ll get you there on time!", and laughed till he wept, and you laughed too, out of a kind of horror. Four hundred and eighty-two.</p>' + fx({ sp: -6 }) },
      { t: 'Tell it to him first, faster', go: () => '<p>You told it to him first, all of it, at a gallop, the lecture and the bouncing and the "Keep your seat, Horace," before he could get his mouth open. He looked at you with deep injury and did not speak again till Sacramento. It was the most restful ride of your life.</p>' + fx({ sp: 10 }) },
      { t: 'Threaten to get out and walk', go: () => '<p>You announced that if anyone mentioned Horace Greeley you would get out and walk to San Francisco. Four passengers looked at you with respect, and one with real fear, and the driver said that was the first sensible thing he had heard a passenger say since 1859.</p>' + fx({ sp: 7 }) },
    ] }, () => westDay()); } },
  { id: 'toll', go: daily => { westScene(); show({
    title: 'The toll gate', body: `<p>The road over the mountains belonged, in sections, to a number of private gentlemen who had improved it by putting up gates and charging for them. At one of these a keeper came out with a lantern and demanded toll for every soul aboard, at a rate he appeared to be making up as he went.</p>${daily}`,
    choices: [
      { t: 'Pay up, a dollar', disabled: S.money < 1, go: () => '<p>You paid. The keeper wrote you a receipt with great ceremony, on the back of an old circus bill, and wished you a pleasant journey over the very road you had just paid him to let you suffer on.</p>' + fx({ money: -1 }) },
      { t: 'Argue the point of law', go: () => Math.random() < .5 ? '<p>You argued that the road was a public highway under the constitution, and the keeper, who had never met the constitution, was so impressed that he let you through for nothing and shook your hand.</p>' + fx({ sp: 6 }) : '<p>You argued, and the keeper argued, and the driver said that if the two of you meant to settle the constitution he would just as soon unhitch and wait. You paid two dollars to be done with it.</p>' + fx({ money: -2, sp: -3 }) },
    ] }, () => westDay()); } },
  { id: 'runaway', if: () => S.wmi > 60, go: daily => { westScene(); show({
    title: 'A runaway on the grade', body: `<p>Coming down a long grade the brake block gave out with a crack, and the ${S.wmode === 'stage' ? 'coach began to overtake the horses' : 'wagon began to overtake the mules'}, which nobody concerned had planned for. The driver stood up on the footboard and yelled, and the whole outfit went down the mountain in a cloud of dust and profanity.</p>${daily}`,
    choices: [
      { t: 'Jump for it', go: () => '<p>You jumped, and lit in a manzanita bush that had been waiting for you since the Creation. The coach made the bottom safe without you, and you walked down after it, picking manzanita out of yourself for a mile.</p>' + fx({ hp: -8, sp: 2 }) },
      { t: 'Hang on and pray', go: () => '<p>You hung on and prayed, and the driver did something with the lines that no man has ever been able to explain, and the whole outfit came round the bottom curve on two wheels and settled down like a hen. The driver said it was nothing. The passengers did not believe him, and neither, you suspect, did he.</p>' + fx({ sp: 8, hp: -2 }) },
    ] }, () => westDay()); } },
  { id: 'emigrants', go: daily => { westScene(); show({
    title: 'Bound for Washoe', body: `<p>At a station you fell in with a party of young men going the other way, up to Washoe to make their fortunes. They had new red shirts, new revolvers, new boots, and a map of the Comstock drawn by a man in Sacramento who had never seen it. They asked your advice, as an old Washoe hand.</p>${daily}`,
    choices: [
      { t: 'Tell them the plain truth', go: () => '<p>You told them about the feet, the assessments, the wildcats, the Zephyr and the winter. They listened with perfect respect and went on up to Washoe anyway, as you would have done, and as you did.</p>' + fx({ sp: 3 }) },
      { t: 'Sell them a few feet of your best wildcat', if: () => Object.values(S.feet || {}).some(v => v > 0), go: () => { const m = Object.keys(S.feet).find(k => S.feet[k] > 0); const n = Math.min(10, S.feet[m]); S.feet[m] -= n; return `<p>You let them have ${n} feet of ${esc(m)} at a price that did them credit as men of enterprise. They went off up the road delighted. You felt a little like a horse-thief and a good deal like a capitalist, which in Washoe are not always distinguishable.</p>` + fx({ money: n * 3, sp: 2 }); } },
      { t: 'Tell them a whopper about the Zephyr', go: () => '<p>You told them the Zephyr once blew a man’s shadow off him and he had to go about for a month without one. They wrote it in their notebooks. Somewhere in Washoe that story is still being told, and it has improved considerably.</p>' + fx({ sp: 8 }) },
    ] }, () => westDay()); } },
  { id: 'bear', if: () => S.wmi < 100, go: daily => { westScene(); outcome('A bear in the road', `<p>A cinnamon bear came out of the timber and sat down in the middle of the road to look the ${S.wmode === 'stage' ? 'stage' : 'mules'} over. The ${S.wmode === 'stage' ? 'leaders' : 'mules'} stopped dead and expressed their views. The bear heard them out, as a matter of courtesy, and then got up and went off into the timber in a leisurely way, like a man who has been to a meeting and found it not worth his while.</p>` + fx({ sp: 6 }) + daily, () => westDay()); } },
  { id: 'meal', go: daily => { westScene(); show({
    title: 'A dollar a meal', body: `<p>The eating stations on this road charged a dollar a meal, which in the Sierra means a dollar for whatever the keeper had, and he generally had beans.</p>${daily}`,
    choices: [
      { t: 'Pay the dollar', disabled: S.money < 1, go: () => '<p>Beans, bacon, saleratus bread and coffee. You were hungry enough to call it good, and honest enough to call it a dollar.</p>' + fx({ money: -1, hp: 5 }) },
      { t: 'Live on crackers in your pocket', go: () => '<p>You dined on crackers out of your coat and a drink from a spring, and told yourself it was the healthier way, and did not believe a word of it by supper.</p>' + fx({ hp: -3, sp: -2 }) },
    ] }, () => westDay()); } },
  { id: 'race', if: () => S.wmode === 'stage', go: daily => { westScene(); outcome('A race', `<p>A coach of a rival line came up behind on the flat, and the two drivers, who loved each other like brothers in the old Cain-and-Abel sense, let out their horses and went down the road side by side for three miles, wheel to wheel, with the passengers of both coaches screaming encouragement and hanging on for their lives. Yours won by a length. The driver was so pleased that he did not speak again for twenty miles, which was a mercy, for he had been telling you about his digestion.</p>` + fx({ sp: 10, hp: -3 }) + daily, () => westDay()); } },
  { id: 'storm', go: daily => { westScene(); outcome('A mountain shower', `<p>Out of a perfectly clear sky a thunderstorm came over the ridge, delivered itself of a quantity of water and noise out of all proportion to its size, and went on its way, and in twenty minutes the sun was out and the road was steaming and everybody aboard was as wet as if they had been baptised by a very thorough denomination.</p>` + fx(S.seat === 'top' && S.wmode === 'stage' ? { hp: -6, sp: 2 } : { sp: 3 }) + daily, () => westDay()); } },
  { id: 'judge', go: daily => { westScene(); outcome('A distinguished passenger', `<p>A gentleman got aboard who was a judge of some court or other in California, and who had refreshed himself at the last station to an extent that made him very affable. He explained the law of mining claims to the whole company for forty miles, with diagrams drawn in the air, and fell asleep on your shoulder at the conclusion of his argument and snored a dissenting opinion all the way down to Placerville.</p>` + fx({ sp: 4, hp: -1 }) + daily, () => westDay()); } },
  { id: 'canary', go: daily => { westScene(); outcome('The lady with the canary', `<p>A lady with a canary in a cage rode with you for a day. The canary sang the whole way, in all weathers and on every grade, with a cheerfulness that was perfectly unaccountable in a bird travelling by ${S.wmode === 'stage' ? 'stage' : 'freight wagon'} over the Sierra Nevada. By evening you would have given five dollars for a cat.</p>` + fx({ sp: -2 }) + daily, () => westDay()); } },
  { id: 'teamster', if: () => S.wmode === 'wagon', go: daily => { westScene(); show({
    title: 'Coombs speaks', body: `<p>That night at the camp by the road, Coombs the teamster took his pipe out of his mouth and spoke four whole sentences, which was more than he had said since Carson. He told you about the winter of ’52, when he had wintered at the summit with his team and lived on mule, and he looked at his mules while he said it in a way that made you think the mules had heard the story too.</p>${daily}`,
    choices: [
      { t: 'Ask him for another', go: () => '<p>He thought about it a long time and told you another, about a grizzly and a coffee pot, that had no end at all, only a long silence and a look. It was the best story you heard on the whole road.</p>' + fx({ sp: 10 }) },
      { t: 'Go to sleep under the wagon', go: () => '<p>You slept under the wagon with the mules breathing on you and the stars standing over the pines as thick as hailstones, and slept as you had not slept since the Lick House, which you had not yet seen.</p>' + fx({ hp: 8 }) },
    ] }, () => westDay()); } },
];

function riverNight() {
  scene.set('river', {});
  S.wmi = WEST_END;
  show({
    title: 'Down the river', where: 'Aboard the Chrysopolis, all night, a hundred and twenty miles to the bay',
    body: `<p>The <i>Chrysopolis</i> backed out from the levee at two in the afternoon with her band playing and her whistle going and every man aboard who could find a rail leaning on it. ${S.flags.cabin ? 'You had a stateroom with a real bed in it, and white sheets, and a little window on the river, and you looked at the bed the way a man looks at his first love.' : S.flags.stowaway ? 'You lay behind a stack of cotton bales near the paddle box and hoped the purser was a nearsighted man.' : 'You staked out a corner among the freight, like a claim, with a sack of oats for a pillow.'}</p><p>In the saloon after supper a quiet gentleman in a black coat had opened a game of faro, and was dealing to anyone with money and a hopeful disposition.</p>`,
    choices: [
      { t: 'Try your luck at faro · $10', disabled: S.money < 10, go: () => Math.random() < .3 ? '<p>You won forty dollars in an hour, which surprised the gentleman in the black coat more than it did you, and he closed the game shortly after, saying he had a headache.</p>' + fx({ money: 40, sp: 8 }) : '<p>You lost ten dollars in eleven minutes, and the gentleman thanked you so handsomely that you almost felt you had made a friend.</p>' + fx({ money: -10, sp: -4 }) },
      { t: 'Go up on deck and watch the river', go: () => '<p>You stood at the rail while the sun went down over the tule marshes and the river widened out toward the bay, and the paddle wheels thrashed along under you with the old sound you remembered from the Mississippi, and for an hour you were a cub pilot again, reading the water, and you would not have traded that hour for twenty feet of Ophir.</p>' + fx({ sp: 10 }) },
      { t: S.flags.cabin ? 'Go to bed in a bed' : 'Sleep where you are', go: () => S.flags.stowaway && Math.random() < .5 ? '<p>The purser found you at midnight with a lantern and an expression. You talked, eloquently, for some time, and at the end of it he let you sleep in the barber’s chair for a dollar, which was the best bargain struck on the river that night.</p>' + fx({ money: -1, hp: 5 }) : '<p>You slept the whole night through with the engine thumping under you like a great heart, and woke with the boat standing still.</p>' + fx({ hp: S.flags.cabin ? 12 : 6 }) },
    ],
  }, () => arriveSF());
}
function arriveSF() {
  S.flags.arrivedSF = 1;
  log('Arrived in San Francisco.');
  sfStart(S.wkind);
}

function sfStart(kind) {
  S.act = 'sf'; S.trouble = 0; S.sfWeek = 0; S.lodging = 'lick'; S.callJob = true;
  S.flags.crashWeek = ri(3, 6); S.flags.quakeWeek = ri(5, 10);
  if (!S.mkt) initMarket();
  // everyone in Washoe has a little silver to sell; you bring yours to the city
  S.feet['Hale & Norcross'] = (S.feet['Hale & Norcross'] || 0) + 20;
  if (!S.mkt.some(m => m.name === 'Hale & Norcross')) S.mkt.push({ name: 'Hale & Norcross', p: 30, vol: .18, drift: .03, last: 30 });
  setDate(1864, 5, 31);
  scene.set('sf', {});
  show({ title: 'San Francisco', where: 'The Broadway wharf, at sunrise', body: `
    <p>The <i>Chrysopolis</i> came down through the Carquinez Strait in the grey of the morning and out onto the bay, and there was San Francisco, piled up on its sand hills in the sun like a city that had been poured out of a sack and not yet swept together. To a man fresh from two years of sagebrush and alkali it was a marvel and a revelation. There were gaslit streets, and horse cars drawn along iron rails by a pair of patient horses, and French restaurants, and booksellers with the newest books from New York only five weeks old, and ladies in silk, and a fog that came in through the Golden Gate every afternoon like a tide of wet wool. There were a hundred and twenty thousand people in it, and not one of them had ever heard of you.</p>
    <p>You had a little silver stock in your pocket: twenty feet of Hale &amp; Norcross, which every broker on Montgomery Street assured you was about to climb, and they ought to know, for they were selling it. On the strength of it you took rooms at the Lick House, the finest hotel on the coast, and ordered dinner in the manner of a capitalist, which is to say without looking at the right-hand side of the bill of fare.</p>
    <blockquote>A week at a time, now. Pay your lodgings, watch the stock board, and keep an eye out for the chance of a lifetime, which in San Francisco generally turns up wearing a stovepipe hat and selling something.</blockquote>`,
    choices: [{ t: 'Begin →', big: true, go: () => { sfHub(); } }] });
}

function sfHub(note) {
  S.act = 'sf'; scene.set('sf', {});
  if (checkDeath()) return;
  if (S.pending) { const ev = S.pending; S.pending = null; return ev === 'quake' ? quake() : pauper(); }
  if (S.sfWeek >= 18 && !S.flags.union) return unionOffer(true);
  const L = LODGING[S.lodging];
  const worth = feetWorth();
  const warn = S.sfWeek === S.flags.crashWeek - 1 ? '<p><i>The board is giddy this week. The bootblacks are buying feet, and your barber gave you a tip on the Gould &amp; Curry while he had the razor at your throat, which is a poor time to argue with a man. The old brokers will remember this week afterwards, and wish they did not.</i></p>' : '';
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
      { t: 'Rest a week', sub: '+health, +spirits', go: () => { sfWeekEnd(1); return `<p>You slept late, walked on the beach at North Point, and let the fog attend to the afternoons, which it did without being asked.</p>` + fx({ hp: 8, sp: 6 }); }, next: () => sfHub() },
      { t: 'Accept the Sacramento Union’s commission to the Sandwich Islands', big: true, if: () => S.sfWeek >= 6 && !S.flags.union, go: () => { unionOffer(false); } },
    ],
  });
}
const SF_FLAVOR = [
  'Montgomery Street is a river of stovepipe hats, and every hat in it has been talking about feet since breakfast.',
  'A sea captain at the hotel bar told you about Honolulu: warm rain, flowers in December, and no snow since the Creation. You have thought about very little else since, and your work shows it.',
  'The fog comes in through the Gate at four o’clock, as punctual as a creditor, and sits down on the town as if it had paid for the room.',
  'At the Occidental a gentleman introduced himself as a millionaire three times over, and borrowed a dollar off you to get home on. You have not seen the dollar since, nor the millions.',
  'The horse car up Third Street is so crowded that you ride the whole way on the step, on one foot and a great deal of faith, and the horses look round at every block to see whether you are still there.',
  'The booksellers on Montgomery Street have the newest novels from New York only five weeks late, which after Washoe is very like reading tomorrow’s paper.',
  'A clipper came in through the Gate under full sail, and the whole waterfront knocked off work to watch her, stevedores, hackmen and two policemen, though the policemen had not been working anyway.',
  'The city has more newspapers than it has readers, and you are beginning to know most of the editors by their debts, and they you by yours.',
  'A street preacher in Portsmouth Square predicted the end of the world for Thursday. On Friday he was back on his barrel, not a particle embarrassed, with a new date and a revised arithmetic.',
  'A week of perfect weather, which the old residents call unusual, and have called unusual every week since ’49.',
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
    title: 'Where to sleep', body: `<p>In San Francisco a man’s address is a kind of stock report: you can read in it what his feet did last week. A body may move up or down as his fortunes require, and the general run of the population, so far as you observed, moved down, and carried their own trunks.</p>`,
    choices: [
      ...Object.entries(LODGING).map(([k, L]) => ({ t: `${L.name[0].toUpperCase() + L.name.slice(1)} · $${L.cost} a week`, sub: L.note + (S.lodging === k ? ' (you live here now)' : ''), disabled: S.lodging === k, go: () => { const up = L.cost > LODGING[S.lodging].cost; S.lodging = k; log(`Moved to ${L.name}.`); return `<p>${up ? 'You moved up in the world, with a hired dray and a little swagger, and tipped the drayman two bits to be seen doing it.' : 'You moved down in the world, carrying your own trunk, by the back stairs, after dark, which is the customary hour for that kind of removal.'}</p>`; }, next: () => sfHub() })),
      { t: '← stay where you are', go: () => { sfHub(); } },
    ],
  });
}

// --- the Morning Call: drudgery with the odd bright spot
const CALL = [
  { t: 'Police court', b: 'Every morning at nine the city’s drunks, brawlers and stray philosophers were paraded before Judge Shepheard, who had heard every excuse in the language and some in Chinook, and fined five dollars apiece.', a: ['Write it up as comedy', 'Your account of a sailor who conducted his own defence in rhymed verse ran on page one. The sailor wrote in to praise the review, and asked for six copies for his mother.', { readers: 8, sp: 3 }], c: ['Give the plain list of names and fines', 'Forty names, forty fines. The compositors set it in their sleep, and the readers took it the same way.', { sp: -3 }] },
  { t: 'The theatre', b: 'A touring company was doing a melodrama in which the heroine was rescued from a sawmill, a railroad train, a flood and the villain, in that order, all in one evening and at no extra charge.', a: ['Review it honestly', 'You wrote that the sawmill gave the best performance of the evening and ought to have been called before the curtain. The manager stopped sending you free tickets.', { readers: 7, sp: 4 }], c: ['Review it kindly', 'You praised the scenery and the heroine’s lungs, which were considerable. The manager sent round a box of cigars, and they were better than the play.', { sp: 2, money: 5 }] },
  { t: 'A fire on Kearny Street', b: 'The bells rang at midnight. A cigar store was afire, and four volunteer companies were racing one another through the streets to be first at the hydrant, which mattered a great deal more to them than the cigar store.', a: ['Run to it', 'You arrived in time to be soaked by two companies at once, both of them claiming the honour, and the cigar store burned to the ground while they argued it.', { hp: -5, readers: 6 }], c: ['Report it from the saloon across the street', 'You got the whole story from the firemen as they came in to recover their strength. It was considerably more vivid than the fire, and lasted longer.', { readers: 3, sp: 3 }] },
  { t: 'The shipping list', b: 'Among your duties was a list of every ship in and out of the harbour, with her tonnage and her cargo. There were a great many ships, and they had all apparently been built by the same man out of the same lumber.', a: ['Liven it up', 'You described a lumber schooner as "proud and mysterious." The editor removed the adjectives with a long knife and some remarks.', { sp: -2 }], c: ['Copy it out faithfully', 'You copied it out, every ton of it, and felt your intellect shrinking like a wool shirt in hot water; but the tonnage was correct.', { sp: -5 }] },
  { t: 'A runaway on Montgomery Street', b: 'A grocer’s horse took fright at a velocipede and went down Montgomery Street at a dead run, with the cart, the grocer and a barrel of pickles.', a: ['Chase it', 'You ran four blocks and came up in time to find the horse standing in an alley eating the pickles, as calm as a deacon at a church supper.', { hp: -3, readers: 6 }], c: ['Interview the velocipede', 'Its owner, a dentist, maintained that it was the horse’s fault. You printed both sides, and neither side was satisfied, which is how you know it was fair.', { readers: 4 }] },
  { t: 'A séance on Stockton Street', b: 'A medium on Stockton Street was raising spirits at four bits a head. Your editor wanted the story; the spirits wanted the four bits.', a: ['Ask the spirits hard questions', 'You asked the departed what Ophir would be quoted at next week. The table banged twice, and the medium asked you to leave, and the spirits, so far as you could make out, sided with her.', { readers: 8, sp: 4 }], c: ['Report what you saw, politely', 'The spirits knocked, a tin trumpet floated about the room, and a lady fainted on schedule. You wrote it straight and let the readers decide, and most of them decided against the spirits.', { readers: 3 }] },
  { t: 'The Board of Supervisors', b: 'The Supervisors were debating whether to pave a street. They had been debating it since the street was a sand dune, and the dune had moved twice in the meantime.', a: ['Report the debate as a war', 'Your dispatch from the "Battle of Folsom Street" was cut by half and still annoyed four Supervisors, which you considered a fair return on the ink.', { readers: 6, trouble: 4 }], c: ['Report the vote', 'They voted to discuss it again. You reported that, in one sentence, which was more than the subject had earned.', { sp: -3 }] },
  { t: 'A perpetual motion machine', b: 'A man in a basement on Jackson Street had built a wheel that would turn forever, he said, just as soon as he could get it started.', a: ['Watch it for an hour', 'It did not move in the hour. Neither did the inventor, who sat and looked at it with such a faith as you have seen at a camp-meeting, and you went home and wrote a kindly piece about hope, and were not ashamed of it.', { readers: 6, sp: 3 }], c: ['Note it and move on', 'Two lines on page three. The next week a second man built a second machine, to keep the first one company.', { readers: 1 }] },
  { t: 'A lost child', b: 'A small boy was lost on the waterfront for a whole day, and was turned up at last asleep in a coil of rope aboard a Sydney packet.', a: ['Write it warmly', 'Mothers all over the city read it twice, and some of them read it aloud to their husbands. A sea captain sent the boy a parrot, which was more than the boy’s father had ever done.', { readers: 7, sp: 6 }], c: ['Write it briskly', 'Lost, found, returned and spanked: three lines, and the boy would have said that was three too many.', { readers: 1 }] },
  { t: 'The hotel arrivals', b: 'Another duty was the list of everybody who had put up at the city’s hotels the day before, spelled the way they spelled it themselves, which was not always the way Providence intended.', a: ['Make up a few distinguished guests', 'You added "the Duke of Washoe and suite" to the Occidental list. Three ladies called at the hotel next day to see him, and the clerk has not forgiven you yet.', { readers: 5, trouble: 6 }], c: ['Copy the list', 'Mr. Smith of Stockton, Mr. Smith of Sacramento, and another Mr. Smith, of nowhere in particular. You began to suspect a conspiracy.', { sp: -4 }] },
  { t: 'A prizefight', b: 'Two heavyweights were to fight on a barge out in the bay, beyond the reach of the police, for a purse of two thousand dollars in gold.', a: ['Go out on the tug', 'They fought seventy rounds, and the barge drifted halfway to Oakland while they did it. You wrote up the whole affair as a naval engagement, with broadsides.', { hp: -3, readers: 9 }], c: ['Get the result by telegraph', 'Somebody won. You had it by eleven o’clock, and could not have told the two of them apart on the street.', { readers: 2 }] },
  { t: 'A billiard match', b: 'The champion of the Pacific coast was to play the champion of Nevada at the What Cheer House, and you knew nothing whatever about billiards except that it was played in saloons.', a: ['Bluff it with technical terms', 'Your account was full of "kisses," "draws" and "a magnificent English." Billiard players read it with the tears running down their faces, though not for the reason you intended.', { readers: 7 }], c: ['Report the score', 'Five hundred to four hundred and something. You left the something out, as being nobody’s business.', { sp: -2 }] },
  { t: 'A wedding on Rincon Hill', b: 'A banker’s daughter was married to a mining superintendent. There were four hundred guests and a cake built in the shape of a stamp mill, stamps and all.', a: ['Describe the cake in detail', 'The cake piece was a sensation. Two bakeries called to ask who had done it, and a mining company wanted to know whether it would crush ore.', { readers: 6, money: 5 }], c: ['Describe the bride', 'You described the bride as charming. Her mother wrote to say she had been radiant. You printed a correction, and the mother was not satisfied with that either.', { readers: 2 }] },
  { t: 'Sunday at the Cliff House', b: 'Of a Sunday every horse in the city went out to the Cliff House to look at the sea lions, and every man, woman and child in the city went along behind the horses.', a: ['Interview a sea lion', 'You quoted the largest one at length. He was against the tariff, in favour of fish, and sound on the Union.', { readers: 8, sp: 4 }], c: ['Count the carriages', 'Two hundred and twelve. You counted twice, to be sure of it, and the readers did not count at all.', { sp: -2 }] },
];
function callWeek() {
  scene.set('sf', { press: true });
  if (S.callWeeks >= 4 && !S.flags.callStory) return callStory();
  const e = deal(CALL);
  show({
    title: `On the Call: ${e.t}`, where: 'Morning Call, Commercial Street · $40 this week',
    body: `<p>Your days ran from nine in the morning till eleven at night: the police court, the hotels, the theatres, the ships, the fires, and whatever else the city did when it supposed nobody was looking. You were the only reporter on the paper, and the paper took care that you never forgot it.</p><p>${e.b}</p>`,
    choices: [e.a, e.c].map(([t, r, d]) => ({ t, go: () => { S.callWeeks = (S.callWeeks || 0) + 1; sfWeekEnd(1); return `<p>${r}</p>` + fx({ ...d, money: 40 + (d.money || 0), sp: -4 + (d.sp || 0) }); }, next: () => sfHub() })),
  });
}
function callStory() {
  S.flags.callStory = 1;
  show({
    title: 'The story the Call won’t print',
    body: `<p>One Sunday you saw a gang of young hoodlums stone a Chinese laundryman in the street, while a policeman stood by and looked on with interest, as at a dog-fight, and did nothing whatever. You went back to the office and wrote it up with every bit of fire you had in you.</p><p>The next morning it was not in the paper. The editor explained that the <i>Call</i> was read by the very people who did such things, and that a paper must think of its subscribers; and he said it as if it settled the matter, which for him it did.</p>`,
    choices: [
      { t: 'Quit, and take the story somewhere that will print it', go: () => { S.callJob = false; S.flags.fired = 1; feat('Quit the Call on principle'); log('Left the Morning Call.'); sfWeekEnd(1); return `<p>You walked out. The piece ran instead in the <i>Enterprise</i>, back in Virginia City, over your own name, and it stung everybody it ought to have stung, and a policeman or two besides. You were out of a regular job, and you had found out what it was that made you angriest in the world, and you went on writing about it, off and on, for forty years.</p>` + fx({ readers: 25, sp: 6, trouble: 10 }); }, next: () => sfHub() },
      { t: 'Swallow it and keep your $40 a week', go: () => { sfWeekEnd(1); return `<p>You kept the job. You also kept the story, folded in your coat pocket, and every so often you took it out and read it over again, and it never once improved your appetite.</p>` + fx({ money: 40, sp: -12 }); }, next: () => sfHub() },
    ],
  });
}

// --- sketches for the literary weeklies
const SKETCHES = [
  { n: 'Answers to Correspondents', d: 'A mock advice column, answering letters nobody sent: what to do about a moustache that will not grow, and whether a gentleman may eat pie with his knife in the presence of a lady.', r: 16 },
  { n: 'A Ball at the Lick House, reported as a battle', d: 'The fashionable world arrives in silk and lace, and you report each lady’s gown the way a general reports troop movements, with the casualties.', r: 15 },
  { n: 'Etiquette for Earthquakes', d: 'A guide for the polite San Franciscan: whom to bow to while the chimney is coming down, and in what order to rescue one’s relatives, beginning with the rich ones.', r: 18, if: () => S.flags.quake },
  { n: 'The Story of the Bad Little Boy', d: 'A boy who steals jam, tells lies and skips Sunday school, and who, unlike the boys in the Sunday-school books, is never once struck by lightning for it, and prospers.', r: 20 },
  { n: 'How to Cure a Cold', d: 'Every remedy your friends gave you, taken one after another and some of them all at once: whiskey, gin, mustard plasters, a cold shower, and a lady’s advice to drink a quart of warm salt water, which you took, and which took you.', r: 17 },
  { n: 'The City Directory, reviewed as a novel', d: 'Too many characters, no plot, and a great many Smiths, but a powerful ending in the Z’s.', r: 14 },
  { n: 'Ode to the Fog', d: 'A mock-heroic poem in nine stanzas to the San Francisco fog, which never reads poetry and arrives at four o’clock regardless.', r: 11 },
  { n: 'Advice to Young Men Going West', d: 'Bring a coat. Bring a second coat. Do not buy feet from a man in a stovepipe hat, and do not buy a horse from his brother, and do not believe a word their uncle says about either.', r: 15 },
  { n: 'A Visit to the Mint, as told by a coin', d: 'A twenty-dollar piece describes its birth in the Mint, its first owner, and the indignity of being bet on a horse called Lightning.', r: 13 },
  { n: 'Lucretia Smith’s Soldier', d: 'A war romance in the sentimental style, laid on so thick that it turns inside out at the end, when the wounded soldier she has nursed for weeks proves to be somebody else entirely.', r: 16 },
  { n: 'A Complaint about the Horse Cars', d: 'An open letter to the horse-car company from a man who has ridden the whole length of Third Street standing on another man’s foot.', r: 12 },
  { n: 'Dinner with the Mining Men', d: 'A dinner party at which every sentence, the grace included, is about feet, assessments and assays.', r: 13 },
  { n: 'Concerning the Dogs of San Francisco', d: 'A census of the city’s dogs, their politics, and their opinion of the new dog tax.', r: 12 },
  { n: 'The Lodging-House Ghost', d: 'A ghost haunts your boarding house, rattling chains all night. On investigation he proves to want nothing but a better room, like everybody else in the house.', r: 15 },
  { n: 'A Literary Tea', d: 'You are invited to a tea where everybody is a poet, and are asked to read, and read them the shipping list, with feeling, and two ladies weep.', r: 14 },
  { n: 'An Inquiry into the Great Bean Question', d: 'Boarding houses serve beans seven days a week. You investigate why, and whether the beans are the same beans.', r: 12 },
  { n: 'My Late Senatorial Secretaryship', d: 'Your service as private secretary to a statesman, during which you answered every letter he received with the wrong answer.', r: 17 },
  { n: 'The Facts in the Case of the Great Beef Contract', d: 'A citizen tries for thirty years to collect a government bill for thirty barrels of beef, and is passed from office to office into eternity.', r: 18 },
  { n: 'Washoe, explained to an Eastern lady', d: 'Patient answers to an imaginary lady in Boston who wants to know whether Nevada has streets, and whether the Zephyr is a young man.', r: 13 },
  { n: 'The Petrified Man, revisited', d: 'Your old hoax, followed into the papers of the East, which have taken it with perfect seriousness and written to ask for a photograph.', r: 14, if: () => (S.usedLeads || []).includes('petrified') },
  { n: 'The Celebrated Jumping Frog of Calaveras County', d: 'The story you heard in the Angel’s Camp tavern, about a gambler, his educated frog Dan’l Webster, and a stranger with a pocketful of quail shot, told exactly as the old man told it: slowly, gravely, and without once suspecting that it was funny.', r: 60, if: () => S.flags.frogHeard, frog: true },
];
function sketchWeek() {
  scene.set('sf', {});
  const avail = SKETCHES.filter(k => (!k.if || k.if()) && !(S.sketched || []).includes(k.n));
  if (!avail.length) return outcome('Writer’s block', '<p>You sat at your desk all week and wrote nothing at all except a letter to your mother asking for nothing in particular, and you were three days on that.</p>', () => { sfWeekEnd(1); sfHub(); });
  // the frog, once heard, is always offered
  const frog = avail.find(k => k.frog);
  const opts = [...(frog ? [frog] : []), ...avail.filter(k => !k.frog).sort(() => Math.random() - .5)].slice(0, 3);
  show({
    title: 'A sketch for the weeklies', where: 'The Californian and the Golden Era pay a few dollars and a great deal of attention',
    body: `<p>The literary weeklies are where the city’s young writers show off for one another. ${S.flags.harte ? 'Bret Harte has promised to look over whatever you write; his pencil is merciless and his advice is good, which is a rare combination in a friend.' : 'The pay is poor, but the readers are the kind who remember a name, and sometimes the name is spelt right.'}</p><p>Which sketch will you write this week?</p>`,
    choices: opts.map(k => ({ t: k.n, sub: k.d, go: () => {
      S.sketched = S.sketched || []; S.sketched.push(k.n);
      let r = Math.round(k.r * rnd(.8, 1.25) * (S.flags.harte ? 1.3 : 1) * (has('notebook') ? 1.1 : 1));
      sfWeekEnd(1);
      if (k.frog) {
        feat('The Jumping Frog'); addBonus(60); log('Published the Jumping Frog.');
        return `<p>You wrote the frog story down. It ran in the <i>Saturday Press</i> in New York, and then in every newspaper in the country that owned a pair of scissors. People who had never heard of Washoe were quoting Dan’l Webster at breakfast. Inside of a month you were, for the first time in your life, a little famous, and did not know what to do with it.</p>` + fx({ readers: r, money: 15, sp: 15 });
      }
      return `<p>${pick(['The piece ran on Saturday. By Monday people were quoting it back to you, wrong.', 'The editor laughed out loud at it, which he said he had not done since the Mexican War, and he seemed a little put out about it.', 'It ran, and a paper in Sacramento stole it the next week, which is the sincerest form of praise on this coast and the only kind you can depend on.', 'A lady at the Lick House asked whether you were the man who wrote it, and then whether you were not ashamed of yourself. You were not, and said so, and she has not spoken to you since.'])}</p>` + fx({ readers: r, money: ri(6, 15), sp: 5 });
    } })),
  }, () => sfHub());
}

// --- the city
const CITY = [
  { t: 'The Cliff House', b: 'You hired a buggy and drove out the long sand road to the Cliff House, where the Pacific broke white on the rocks and the sea lions sat on Seal Rock barking like a convention of aldermen with a contract to let.', fx: { sp: 9 } },
  { t: 'The Mint', id: 'harte', b: 'At the Branch Mint you met the secretary to the superintendent, a neat, clever young man named Bret Harte, who edited the <i>Californian</i> on the side and parted his hair with great exactness. He had read your Washoe pieces. He offered to look over your sketches before they went to print, and you were wise enough to let him.', fx: { sp: 8, readers: 4 }, then: () => { S.flags.harte = 1; feat('Befriended Bret Harte'); } },
  { t: 'Mission Dolores', b: 'You walked out to the old adobe mission at the edge of town, built when San Francisco was nothing but sand and Spaniards, with roses in the graveyard and a calm about it that the rest of the city had never found the time for.', fx: { sp: 7, hp: 2 } },
  { t: 'Telegraph Hill', b: 'On the top of Telegraph Hill a man with a semaphore signalled the ship arrivals to the city: arms up for a sidewheel steamer, arms out for a brig. You watched half the waterfront break for the wharves every time he raised his arms, like a congregation let out at the benediction.', fx: { sp: 6 } },
  { t: 'A Chinese theatre on Jackson Street', b: 'A play was in progress at the Chinese theatre, a historical drama which, the gentleman beside you explained, had begun a week ago and would go on some weeks yet. The costumes were magnificent, the orchestra was magnificent and loud, and the audience came and went with great courtesy. You stayed three hours and understood a good deal more than you expected, which is more than you can say for most plays in English.', fx: { sp: 8 } },
  { t: 'The Oakland ferry', b: 'You took the ferry across the bay to Oakland for no reason but the ride. The gulls followed the boat the whole way in the belief that you were carrying bread. You were not, and they told you what they thought of you all the way back.', fx: { sp: 6, hp: 2 } },
  { t: 'A Turkish bath', b: 'You tried the new Turkish bath on Washington Street: steam, a marble slab, and an attendant who folded you up like a shirt and put you away. You came out two inches taller and a new man, and the new man wanted to lie down.', fx: { hp: 8, money: -3 } },
  { t: 'A waterfront saloon', b: 'Down on the waterfront, sailors out of every country on earth were telling lies in every language on earth. A whaler from Nantucket told you about the Sandwich Islands till the bar closed, and then went on telling the lamp-post.', fx: { sp: 6, hp: -2 }, then: () => { S.flags.heardIslands = 1; } },
  { t: 'Woodward’s Gardens', b: 'A rich man had thrown his gardens open to the public: lawns, a conservatory, a sea-lion pond, a museum, a bear named Ben, and a balloon on Sundays. You spent a whole afternoon there and never once thought of stocks, which is the highest praise a San Franciscan can give a place.', fx: { sp: 9 } },
  { t: 'Portsmouth Square', b: 'In the old plaza a political speaker stood on a barrel and explained for two hours what was wrong with everything, beginning with the Copperheads. A dog sat in front of him the whole time, listening with great attention, and was the only member of the audience who went away unconvinced.', fx: { sp: 5, readers: 2 } },
  { t: 'An evening with the Bohemians', b: 'You fell in with the city’s young writers and artists, who met in a back room on Montgomery Street to drink, argue and read one another their work. They were poor and brilliant and certain they would be famous, and a few of them were right, which is a better average than the mines.', fx: { sp: 8, readers: 4 } },
  { t: 'The Pioneers’ parade', b: 'The Society of California Pioneers marched up Montgomery Street, old men who had come in ’49, every one of whom would explain to you, cheerfully and at length, that the town had been a great deal better before you came.', fx: { sp: 5 } },
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
    body: `<p>You were walking along Third Street when the world took a step to the left, and then thought better of it and took one to the right. A frame house across the way leaned out over the street like a man looking for a dropped quarter, changed its mind, and settled back. A church bell rang all by itself, without benefit of clergy. In a moment the street was full of people in every degree of dress, from Sunday best to a bath towel, every one of them looking up.</p><p>Then it was over, and a man beside you remarked, quite calmly, "That was a good one," and lit his cigar.</p>`,
    choices: [
      { t: 'Stand and take notes on everyone else', go: () => { S.flags.quakeNotes = 1; feat('Took notes during the earthquake'); return `<p>You noted a man running out of a hotel with nothing in the world but a cigar, a lady carrying a birdcage with no bird in it, and a fireman who slid down his pole and kept on going. It would make a very good sketch, and it did.</p>` + fx({ sp: 10, readers: 6 }); } },
      { t: 'Run for the middle of the street', go: () => `<p>You ran for the middle of the street and were knocked flat by a horse car whose horses were running for the middle of the street too. Nothing was broken but your dignity, and that had been cracked before.</p>` + fx({ hp: -6, sp: 4 }) },
      { t: 'Duck into a doorway', go: () => `<p>You sheltered in a doorway that proved to belong to a saloon, and the barkeeper set out a free drink all round to steady the nerves. You steadied yours twice, and would have gone a third time, but the earthquake was over.</p>` + fx({ sp: 6, hp: -1 }) },
    ],
  }, () => sfHub());
}

function pauper() {
  scene.set('sf', { fog: true });
  show({
    title: 'Down and out', where: S.flags.crashed ? 'After the silver bubble burst' : 'At the bottom of your purse',
    body: `<p>The money was gone. ${S.flags.ruined ? 'The feet that were going to make you rich were worth less now than the paper they were printed on, and you had meant to sell next week.' : ''} You owed the landlady, the tailor and the restaurant, and took to walking down side streets to dodge all three. For weeks together you had not ten cents to your name. You learned to the minute how long a man can make one cup of coffee last at a free-lunch counter, and how long the barkeeper will let him.</p>`,
    choices: [
      { t: 'Borrow from Steve Gillis', go: () => `<p>Steve handed over fifty dollars without a word, which was the kind of friend Steve was. You paid him back, eventually, in the form of a great many dinners, most of which he paid for.</p>` + fx({ money: 50, sp: 4 }) },
      { t: 'Move to the garret and tighten your belt', go: () => { S.lodging = 'garret'; return `<p>You moved to a garret on Minna Street and lived on bread, coffee and pride. The pride gave out first.</p>` + fx({ money: 20, sp: -6 }); } },
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
    body: `<p>You went up into the foothills to stay with your friend Jim Gillis, Steve’s brother, in his cabin on Jackass Hill. The great days of the gold rush were long over there. The camps were half empty, the hills were green with oaks, and the few men left made a living at <b>pocket mining</b>: hunting for little nests of gold the forty-niners had missed, by washing pan after pan of dirt down a hillside and following the trail of specks uphill to where they came from.</p>
      <p>Jim’s partner was an old miner named Dick Baker, a grave, kind, slow-spoken man, who had been hunting one more good pocket for eighteen years and was not discouraged yet. He owned a large grey cat.</p>`,
    choices: [{ t: 'Ask Dick about the cat', go: () => tomQuartz() }],
  });
}
function tomQuartz() {
  S.flags.tomquartz = 1;
  show({
    title: 'Tom Quartz', body: `<p>Dick told you, very seriously, about another cat he had once owned, named Tom Quartz: a cat of uncommon judgment, who superintended all of Dick’s mining and knew more about it than any man in the camp. Tom Quartz did not hold with quartz mining, Dick said. He considered it a new-fangled arrangement.</p>
      <p>One day, while they were blasting a shaft, Tom Quartz went to sleep at the bottom of it on a gunny sack. The fuse was lit. There was a roar, and up out of that shaft, in a cloud of rocks and dirt, went Tom Quartz, turning over and over, a-snorting and a-sneezing and a-clawing, a hundred and fifty feet into the air. He came down some way off, with his fur singed and a look on his face as much as to say, "I hope you are satisfied."</p>
      <p>"After that," said Dick, "you never see a cat so prejudiced agin quartz mining as what he was."</p>`,
    choices: [
      { t: 'Ask whether the story is true', go: () => `<p>Dick looked at you with such a deep and settled reproach that you never asked again, and are sorry yet that you asked the once.</p>` + fx({ sp: 8 }) },
      { t: 'Write it down word for word', go: () => { feat('Wrote down Tom Quartz'); return `<p>You wrote it in your notebook exactly as he told it, dialect and all. You had a notion it was worth more than any pocket in the county, and you were right, though it was some years paying out.</p>` + fx({ sp: 10, readers: 4 }); } },
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
      ${msg ? `<p>${msg}</p>` : '<p>You start at the bottom of the slope with a pan, a bucket of water and a great deal of hope, which is the regular outfit for the business.</p>'}
      <div class="grid" style="grid-template-columns:repeat(${C},1fr);max-width:480px">${Array.from({ length: R * C }, (_, i) => { const c = i % C, r = (i - c) / C, k = `${c},${r}`, v = panned.get(k); return `<button class="cell${v !== undefined ? ' dug' + (v === 'P' ? ' vein' : '') : ''}" data-c="${c}" data-r="${r}" ${v !== undefined || !pans || found ? 'disabled' : ''} style="font-family:VT323,monospace;font-size:20px;${v > 0 ? 'color:#f3d38c' : ''}" aria-label="pan at column ${c + 1}, row ${r + 1}">${v === undefined ? '' : v === 'P' ? '★' : v === 0 ? '·' : '•' + v}</button>`; }).join('')}</div>
      <div class="choices"><button class="btn" id="panDone">${pans && !found ? 'Give up and go back to the cabin' : 'Back to the cabin →'}</button></div>`;
    page.querySelectorAll('.cell').forEach(b => b.onclick = () => {
      const c = +b.dataset.c, r = +b.dataset.r, v = specks(c, r); panned.set(`${c},${r}`, v); pans--; sfx('pick');
      let m;
      if (v === 'P') { found = ri(500, 2600); sfx('good'); m = `<b>A pocket!</b> The pan came up yellow. You dug with your hands, and out of a seam no bigger than a hat came lumps of gold as big as beans. Dick Baker took off his hat and held it to his chest, as at a funeral, only happier. It was worth <b>${money(found)}</b>.`; }
      else if (v > 0) { dust += v; m = `${v} specks. ${v >= 6 ? 'Close; the trail is narrowing like a funnel.' : v >= 3 ? 'Warmer.' : 'A faint trace, about enough to gild a flea.'}`; }
      else m = pick(['Nothing but dirt, and poor dirt at that.', 'Not a speck.', 'Dick shook his head: off the trail.']);
      render(m);
    });
    $('panDone').onclick = () => finishPocket(found, dust, [...panned.keys()].some(k => { const [c, r] = k.split(',').map(Number); return Math.abs(c - pc) <= 1 && Math.abs(r - pr) <= 1; }));
  };
  render();
}
function finishPocket(found, dust, close) {
  sfWeekEnd(3); S.act = 'pocket';
  let html;
  if (found) { feat('Found a gold pocket'); html = `<p>You came down from Jackass Hill richer than you went up, which was a thing hardly anybody in Tuolumne County had done since ’52.</p>` + fx({ money: found + dust, sp: 15 }); }
  else if (close) html = `<p>On the last afternoon you were one pan from the pocket, you were sure of it, when a cold rain set in. You left a bucket of dirt standing, unwashed, and went back to the cabin to dry off. Two strangers came along next morning, washed out your bucket from idle curiosity, and took a fortune out of the hillside where you had left off. You heard about it a week later, in town, from one of them, who was very pleasant about it.</p>` + fx({ money: dust, sp: -6 });
  else html = `<p>Three weeks of panning, and you had a little dust, two sore knees and a deep respect for Dick Baker’s patience, which was the only thing on the hill that never gave out.</p>` + fx({ money: dust, hp: 4 });
  outcome('Down from the hill', html, () => frogTavern());
}
function frogTavern() {
  scene.set('hill', { tavern: true });
  show({
    title: 'A rainy week at Angel’s Camp', where: 'The tavern at Angel’s Camp, Calaveras County',
    body: `<p>On the way back it rained for a week, and you and Jim sat in the tavern at Angel’s Camp with nothing to do but eat beans and listen. An old fellow named Ben Coon, a former river pilot, fat and solemn, told a long story about a man called Smiley who would bet on anything that moved, and a frog called Dan’l Webster that he had educated to jump, and a stranger who filled the frog full of quail shot so that he couldn’t budge.</p><p>Coon told it without the least suspicion that there was anything funny about it. He told it as if it were a sermon, and a sad one. You and Jim very nearly died.</p>`,
    choices: [
      { t: 'Remember every word', go: () => { S.flags.frogHeard = 1; log('Heard about a jumping frog.'); return `<p>For the rest of the week you and Jim say "I don’t see no p’ints about that frog that’s any better’n any other frog" to each other at every meal, and laughed till the landlord asked you to take it outdoors. You meant to write it down when you got back to the city.</p>` + fx({ sp: 14 }); } },
      { t: 'Try to get some sleep', go: () => `<p>You slept through the best story you would ever hear. Jim told it to you afterwards, and told it worse.</p>` + fx({ hp: 4 }) },
    ],
  }, () => sfHub(`<p>You came back down to the city with Calaveras mud on your boots and a notebook full of the gold country.</p>`));
}

function unionOffer(forced) {
  S.flags.union = 1;
  scene.set('sf', {});
  show({
    title: 'A letter from the Sacramento Union',
    body: `<p>${forced ? 'You had had about all of San Francisco a man can stand. ' : ''}The new steamer <i>Ajax</i> was to make a run to the Sandwich Islands, and the <i>Sacramento Union</i> wanted a correspondent aboard. They would pay <b>$20 a letter</b>, and your passage, for as many letters as you cared to write from the islands about the sugar, the whaling, the volcanoes, the people, and anything else worth the postage.</p><p>Warm rain, a sea like blue silk, flowers in winter: you had been hearing about it in every waterfront saloon in the city, until you began to suspect the saloons were in the pay of the islands.</p>`,
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
    <p>The <i>Ajax</i> steamed out through the Golden Gate on a grey morning with a load of passengers, a cargo of hay and potatoes, and you. By noon California was a line on the horizon; by dark it was gone. There were two thousand one hundred miles of ocean between you and Honolulu, and nothing whatever in between but water and the Old Admiral, of whom more presently.</p>
    <blockquote>In the islands, every day counts. Ride, climb, explore, and gather material (<b>notes</b>). Then turn your notes into <b>letters</b> to the Union: $20 each, and readers by the thousand. You have about ${DAYS} days before the ship home.</blockquote>`, () => voyageDay());
}

// --- the voyage out
const VOYAGE = [
  { t: 'Seasick', b: 'On the second day the <i>Ajax</i> met a long Pacific swell and began to roll like a cradle with ambitions. Half the passengers retired below and prayed. The other half wished they had thought of it.', c: [['Stay on deck in the wind', 'The wind saved you. You were the only man at dinner, and you ate three dinners, out of pure triumph and a spirit of revenge.', { hp: 4, sp: 6 }], ['Go below and lie down', 'Below decks it was worse. You spent a day on your back getting acquainted with the ceiling of your cabin, and could draw it from memory yet.', { hp: -8 }]] },
  { t: 'Whales', b: 'A spout on the starboard bow, and another, and then a whole school of whales rolling by, their great backs shining like wet rocks in a creek.', c: [['Watch them until they’re gone', 'You stayed at the rail an hour. Afterwards a passenger told you exactly how many barrels of oil each one would try out, and what it would fetch in New Bedford, and you could have thrown him over.', { sp: 8, notes: 1 }]] },
  { t: 'Flying fish', b: 'The sea warmed and turned a deep blue, and flying fish began to skitter away from the bow in silver flocks, skimming yards over the waves like a handful of new dimes flung by a drunkard.', c: [['Try to catch one', 'One of them landed on deck at your feet of its own accord. The cook fried it for you. It was delicious, and you felt a little low about it afterwards, though not until afterwards.', { sp: 6, hp: 2 }]] },
  { t: 'Into the trade winds', b: 'Overnight the air turned soft and warm, and the overcoats went back into the trunks for good. The trade wind blew steady out of the northeast, as reliable as a clock, and a great deal more reliable than any clock in Washoe.', c: [['Sleep on deck', 'You slept on deck under stars as big as lamps, and woke with the sun on your face and a sailor stepping over you with a bucket and a remark.', { hp: 6, sp: 6 }]] },
  { t: 'Cards in the saloon', b: 'A party of passengers had a game of whist going in the saloon that had been running since San Francisco and bid fair to outlast the voyage, and possibly the passengers.', c: [['Join in', 'You played whist for three days. You did not understand whist when you began, and you understood it less when you finished, but you won four dollars, which is all a man can fairly ask of any science.', { money: 4, sp: 4 }], ['Watch and take notes', 'You took notes on each player’s method of losing, which was various. It was a sketch in itself.', { notes: 1 }]] },
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
    body: `<p>Among the passengers was a retired whaling captain whom everybody called the Admiral: a big, warm-hearted, thunderous old man with an opinion on every subject and a fact to prove it, the most of the facts having been manufactured on the spot, to order. He argued politics from breakfast to bedtime and had never, within the memory of man, been beaten.</p><p>But there was another passenger, a mild man named Williams, who had been watching the Admiral for some days with a thoughtful eye, like a man looking over a horse he means to buy.</p>`,
    choices: [
      { t: 'Egg Williams on', go: () => { feat('Saw the Admiral beaten'); return `<p>Williams opened a political argument with the Admiral and won it by the Admiral’s own method: by inventing facts faster than the Admiral could, quoting books that were never written, and remembering battles that were never fought, all with perfect confidence and not a flicker of shame. The Admiral was routed, horse, foot and artillery. He stared at Williams in perfect astonishment, then went up on deck, and was not heard from again until Honolulu.</p>` + fx({ sp: 14 }) + '<p class="fx">+2 notes</p>'; }, next: () => { S.notes += 2; voyageDay(); } },
      { t: 'Argue with the Admiral yourself', go: () => `<p>You held out for twenty minutes, which was the record for the voyage. He shook your hand afterwards and told you that you were a fine young man and wrong about everything, and that he would be glad to explain it to you again in the morning.</p>` + fx({ sp: 6, hp: -2 }) + '<p class="fx">+1 note</p>', next: () => { S.notes += 1; voyageDay(); } },
    ],
  });
}
function arriveHonolulu() {
  S.isle = 'oahu'; setDate(1866, 3, 18);
  scene.set('island', { harbor: true });
  log('Arrived at Honolulu.');
  outcome('Honolulu', `<p>On the eleventh morning a long green island rose out of the sea with a crater at one end of it, and the <i>Ajax</i> steamed in past the reef into Honolulu harbour. The water was so clear you could see the coral on the bottom, and the fish going about their business. On the wharf half the town had turned out to meet the steamer: people in white, people on horseback, people with flowers, and a brass band playing something in a key of its own invention.</p>
    <p>You stepped ashore into a warm, damp, sweet-smelling air, under coconut palms, beside a white church and a row of little houses with verandas smothered in vines, and felt the ice of the Sierra and the fog of San Francisco melt out of you at once, like a snowbank in a Turkish bath.</p>` + fx({ sp: 14, hp: 6 }), () => isleHub());
}

// --- island outings. Each takes days, shows its own picture, and asks what you will do there.
// The choice decides the notes (material for letters), the cost to body and spirits, and any flags.
const ACT = {
  oahu: [
    { id: 'horse', t: 'Hire a horse and see Honolulu', d: 1, spot: 'horse',
      intro: 'The livery man in Honolulu had a yard full of horses and a great deal of confidence in all of them. He described each one, with his hand on its neck, as a horse of uncommon spirit. As far as you could see, the spirit had departed out of every one of them some years before, leaving only the horse.',
      c: [
        { t: 'Take the one he calls spirited', n: 2, flag: 'horse', fx: { sp: 8, hp: -4 }, r: 'You took the spirited one. He was a long, gloomy, thoughtful animal who would walk only toward home. Pointed out of town, he went to sleep; turned back toward the stable, he went off like a cannonball. You saw a great deal of Honolulu that day, in a series of reluctant walks and terrified gallops: the white coral houses, the gardens of oleander and tamarind, and, very close, a great many fences.' },
        { t: 'Pick the meekest one in the yard', n: 2, flag: 'horse', fx: { sp: 10, hp: -6 }, r: 'You picked the meekest-looking animal in the yard, a mild, melancholy creature that turned out to be a retired race horse, who had retired from everything but the habit. Every time another horse came up behind him he laid back his ears and ran, and you went down the Waikiki road at a speed the island had not seen since the Kamehamehas, with your hat in one hand and the Lord in the other.' },
        { t: 'Walk, on principle', n: 1, fx: { sp: 5, hp: -2 }, r: 'You declined to be carried by an animal you had not been introduced to, and walked. You saw everything twice as slowly and three times as well, and the people of Honolulu, who never walked anywhere if a horse was handy, came out on their verandas to look at you as a curiosity.' },
      ] },
    { id: 'pali', t: 'Ride up the Nuuanu valley to the Pali', d: 1, spot: 'pali',
      intro: 'The road went up the Nuuanu valley between green walls hung with ferns and waterfalls, climbing all the way, and ended without warning at the edge of the world: the Pali, a precipice a thousand feet high, with the whole windward coast of the island spread out below like a map in a schoolroom, and a gale coming up the face of it that would blow the hair off a dog.',
      c: [
        { t: 'Stand at the very edge in the gale', n: 2, fx: { sp: 10, hp: -2 }, r: 'You walked out to the edge and leaned on the wind, which held you up like a hand. Your hat left you and went up instead of down, and you watched it rise over your head and sail off toward Japan, and you have no doubt it is there yet, being admired.' },
        { t: 'Have the guide tell of Kamehameha’s battle', n: 3, fx: { sp: 6 }, r: 'Your guide told you how the first Kamehameha drove the army of Oahu up this valley, step by step, till they came to the cliff with nowhere to go but over it, and hundreds went over. He told it simply and without hurry, as if it had happened to his own people, which it had. You stood a long while looking down, and did not feel like making any jokes about it.' },
        { t: 'Climb down a little way for the view', n: 2, fx: { sp: 7, hp: -5 }, r: 'You climbed down the old trail a little way, for the view, and got it, and then you looked for the way back up, and the view looked back at you. You came up again on your hands and knees with the guide hauling on your coat collar, and you have never been so fond of a coat collar.' },
      ] },
    { id: 'surf', t: 'Go down to Waikiki for the surf-bathing', d: 1, spot: 'surf',
      intro: 'At Waikiki the young men of the island went out through the breakers with long boards, lay on them, waited for a great comber, and then came racing in on the crest of it like a bird, standing up some of them, at a speed that would have done credit to an express train. It looked like the easiest thing in the world.',
      c: [
        { t: 'Borrow a board and try it', n: 2, flag: 'surf', fx: { sp: 9, hp: -6 }, r: 'You borrowed a board, paddled out, chose your wave with judgment, and set off. The board arrived on the beach a good three-quarters of a second before you did. You arrived some time later, by a different route, with a quart and a half of the Pacific Ocean inside you. None but the natives ever master the art of surf-bathing thoroughly, they told you kindly, and you were content to believe them.' },
        { t: 'Watch from the beach and take notes', n: 3, fx: { sp: 6 }, r: 'You sat on the sand under a hau tree and watched them all afternoon, and filled six pages, and came away with the opinion that it was the finest sport you had ever seen, and the further opinion that you would never attempt it, which is the safest kind of opinion a man can hold.' },
        { t: 'Go out through the surf in a canoe', n: 2, fx: { sp: 11, hp: -2 }, r: 'Two young fellows took you out through the surf in an outrigger canoe and brought you back in on a breaker, the canoe shooting along on the face of the wave with the spray flying, and you holding on to the gunwale and yelling like a Comanche. You asked them to do it again, and they did, and you yelled again.' },
      ] },
    { id: 'legis', t: 'Look in on the Legislature', d: 1, spot: 'legis',
      intro: 'The Legislature of the Kingdom sat in a plain hall, nobles and elected representatives together, the nobles in black broadcloth and the commoners in whatever they had. Every speech was made in Hawaiian and turned into English by an interpreter, a patient man who looked as though he had been interpreting since the flood.',
      c: [
        { t: 'Follow the debate through the interpreter', n: 3, fx: { sp: 6, readers: 3 }, r: 'You followed a debate on a bill to tax dogs. The Hawaiian speeches were long, eloquent and very funny, judging by the house; the English version came out about a third the length and with every joke taken out of it, so that you laughed a beat behind the room all afternoon and were taken for a man of slow parts.' },
        { t: 'Buttonhole a noble at the recess', n: 2, fx: { sp: 7 }, r: 'At the recess a large and dignified noble consented to explain the dog tax to you, in very good English, and then the sugar tariff, and then the shortcomings of the American consul, and you came away a good deal better informed than you went in, and the consul a good deal worse off.' },
        { t: 'Doze in the gallery', n: 1, fx: { hp: 4, sp: 2 }, r: 'You dozed in the gallery. Legislatures are the same the world over, and the drowsiness of this one was of a fine international quality.' },
      ] },
    { id: 'saturday', t: 'See Honolulu ride out on a Saturday', d: 1, spot: 'riders',
      intro: 'On Saturday afternoon all Honolulu got on a horse. Hundreds of riders went galloping through the streets toward the beach, the women riding astride with long bright skirts streaming out behind them, wreaths of flowers on their heads and round their necks, everybody laughing, everybody racing everybody else.',
      c: [
        { t: 'Hire a horse and join the gallop', n: 2, fx: { sp: 12, hp: -5 }, r: 'You hired a horse and fell in with them, and the horse, catching the spirit of the thing, went off down the beach road with the rest in a cloud of dust and flowers. You arrived at the beach exhausted, crowned with somebody’s wreath that had blown onto you on the way, and as happy as you ever were in your life.' },
        { t: 'Stand on a corner with your notebook', n: 3, fx: { sp: 8 }, r: 'You stood on a corner with your notebook and were nearly run down nine times by the most cheerful people you ever saw, every one of whom apologised over their shoulder, laughing, at a full gallop.' },
        { t: 'Buy a lei from a flower-seller', n: 1, fx: { sp: 9, money: -1 }, r: 'You bought a wreath of flowers from an old woman on the corner, and she put it round your neck herself, and told you that now you looked like a person, which was more than San Francisco had ever said.' },
      ] },
    { id: 'whalers', t: 'Go down among the whaling fleet', d: 1, spot: 'whalers',
      intro: 'The whaling fleet was in from the Arctic: forty ships lying in the harbour, black and greasy and smelling powerfully of their trade, with their crews ashore spending a season’s wages at the rate of a season a day.',
      c: [
        { t: 'Dine aboard with a Nantucket captain', n: 3, fx: { sp: 7, hp: 3 }, r: 'A Nantucket captain gave you dinner in his cabin and told you how the whale was getting scarce, and the oil was getting cheap, and men were boring for a kind of rock oil in Pennsylvania that would ruin the whole trade. It was the best lecture on economics you ever heard, and it ended with pie.' },
        { t: 'Climb the rigging to the masthead', n: 2, fx: { sp: 9, hp: -4 }, r: 'You went up the shrouds to the masthead, on a dare, and sat in the crow’s nest where the lookout sits for months at a time watching for spouts, and looked out over the harbour and the town and the green mountains, and did not want to come down; and when you tried to, you found you could not, and two sailors had to come up and show you how, with remarks.' },
      ] },
  ],
  hawaii: [
    { id: 'kona', t: 'Ride down the Kona coast', d: 2, spot: 'kona',
      intro: 'The Kona coast ran south for fifty miles, a strip of green between the black lava and the blue sea: orange groves, coffee trees, bananas, bread-fruit, and little villages of grass houses, and the surf bursting white on the lava below the trail the whole way.',
      c: [
        { t: 'Take the upper trail through the coffee groves', n: 3, fx: { sp: 11, hp: 3 }, r: 'You rode two days through coffee and oranges, picking the fruit off the trees as you went, and in every village people came out to see the stranger go by and to give him something to eat. On the second night an old couple put you up in a grass house that was cooler and cleaner than the Lick House, and gave you their own mat, and would not take a cent.' },
        { t: 'Go down to a fishing village by the sea', n: 3, fx: { sp: 9 }, r: 'You went down to a fishing village on the shore, and the fishermen took you out at dawn in their canoes, and you watched them take fish out of a sea so clear you could see the fish deciding whether to be caught. They gave you raw fish with salt for breakfast, and you ate it to be polite, and then ate more of it because it was good.' },
        { t: 'Canter along the cliff trail', n: 2, fx: { sp: 8, hp: -6 }, r: 'You cantered along the cliff trail, with the surf booming eighty feet below on the left and the horse picking his way on a ledge of lava about the width of a church pew. The horse knew what he was doing. You did not, and spent the afternoon in a state of devout reflection.' },
      ] },
    { id: 'cook', t: 'Visit Kealakekua Bay, where Captain Cook fell', d: 1, spot: 'cook',
      intro: 'Kealakekua Bay was a still, blue half-moon under a great wall of cliff. Here Captain Cook came ashore in 1779 and was received as something a good deal more than a man; and here, a few weeks later, when the islanders had come to understand that he was only a man after all, and a demanding one, he was killed on a flat black rock at the water’s edge.',
      c: [
        { t: 'Stand on the rock where he fell', n: 3, fx: { sp: 4 }, r: 'You stood on the flat black rock with the water lapping at it. There was the stump of a coconut tree near by, with a copper plate nailed to it by some ship’s company, and that was all. The bay was very quiet. You thought a long time about how strangers ought to come ashore in other people’s countries, and came to no conclusion that would have pleased the Admiralty.' },
        { t: 'Hear the story from an old man of the village', n: 4, fx: { sp: 6 }, r: 'An old man of the village, whose grandfather had been a boy on the beach that day, told you the story as his family told it: the welcome, the feasting, the stolen boat, the chief taken hostage, the fight on the rocks. It was not the story in the English books. You wrote it all down, and judged it the better history of the two.' },
        { t: 'Swim in the bay', n: 1, fx: { sp: 8, hp: 4 }, r: 'You swam out over the coral in water as warm as milk and as clear as air, and floated on your back looking up at the cliff, and the fish came and looked at you, and you would have stayed all day if a dark shape had not gone by underneath that you preferred not to be introduced to.' },
      ] },
    { id: 'refuge', t: 'See the Place of Refuge at Honaunau', d: 1, spot: 'refuge',
      intro: 'Behind a great wall of black lava stones, fitted together without mortar and broad enough to drive a wagon along the top of, lay the old Place of Refuge. In the old days a man who had broken a sacred law, or a warrior beaten in battle, could run for it, and if he reached the wall ahead of his pursuers he was safe, and forgiven, and might go home.',
      c: [
        { t: 'Walk the top of the wall', n: 3, fx: { sp: 7 }, r: 'You walked the length of the wall in the sun and decided that it was a better institution than most of the laws you had seen made, and that California might do worse than build one, though it would have to be a good deal bigger to hold everybody that needed it.' },
        { t: 'Sketch the old carved images', n: 2, fx: { sp: 6 }, r: 'Tall carved images of wood stood guard over the place, grim and grand, and you sat down and tried to draw them in your notebook. The drawings came out looking like a row of fence-posts with indigestion, but the notes were good.' },
        { t: 'Run the last hundred yards as a fugitive would', n: 2, fx: { sp: 10, hp: -4 }, r: 'You ran the last hundred yards to the wall over the broken lava, as a fugitive would have run it with the spears behind him, and arrived blown, with your boots cut to ribbons, and sat down inside the wall feeling safe and forgiven and considerably out of breath.' },
      ] },
    { id: 'volcano', t: 'Go up to the volcano, Kilauea', d: 3, go: () => volcano() },
    { id: 'hilo', t: 'Ride to Hilo and the waterfalls', d: 2, spot: 'falls',
      intro: 'On the wet side of the island the rain fell warm every afternoon, and the whole country was ferns, waterfalls and rushing streams, and the town of Hilo sat at the head of a bay with the green running right down to the water.',
      c: [
        { t: 'Swim in the pool under the falls', n: 2, fx: { sp: 9, hp: 4 }, r: 'You swam in a pool under a waterfall with a crowd of children who were plainly astonished at how badly a grown man could swim. They gave you a lesson, free, and you learned nothing, and everybody had a fine time.' },
        { t: 'Slide down the river rocks as the boys do', n: 2, fx: { sp: 11, hp: -5 }, r: 'The boys of Hilo slide down a long smooth chute of river rock on the seat of their trousers into a pool, and you did it too, once, and came out at the bottom with the seat of your trousers in Hilo and the rest of you somewhere further down. The boys said it was the best they had ever seen it done.' },
        { t: 'Take dinner at the mission house', n: 3, fx: { sp: 6, hp: 5 }, r: 'The missionary family at Hilo gave you a New England dinner of baked beans and brown bread in the middle of the Pacific Ocean, with grace before and after, and you ate as if you had been raised on it, which you had not, and felt yourself improved by it, which you were.' },
      ] },
  ],
  maui: [
    { id: 'haleakala', t: 'Climb Haleakala for the sunrise', d: 2, go: () => haleakala() },
    { id: 'iao', t: 'Ride into the Iao Valley', d: 1, spot: 'iao',
      intro: 'The Iao Valley ran back into the mountains between walls of rock thousands of feet high, all hung with ferns and vines and threads of waterfall, and in the middle of it a great green needle of stone stood straight up out of the valley floor, as if somebody had driven a spike there to hold the island down.',
      c: [
        { t: 'Climb toward the needle', n: 2, fx: { sp: 8, hp: -4 }, r: 'You climbed toward the needle as far as the ferns and the rock and your wind would let you, which was not far, and sat down on a ledge and looked down the valley to the sea, and declared it the finest view in the islands, which you had declared of every view you had seen so far.' },
        { t: 'Ask the guide about the battle', n: 3, fx: { sp: 5 }, r: 'The guide told you of the battle fought in this valley, when Kamehameha’s army came up it, and the dead lay so thick in the stream that it ran red and was dammed with them. Today there was nothing in the valley but birdsong and the sound of water, and you were glad of it.' },
        { t: 'Picnic by the stream', n: 1, fx: { sp: 9, hp: 5 }, r: 'You ate your dinner by the stream under a kukui tree, with bananas and cold chicken and a bottle of something the guide had brought, and slept an hour after, and woke with a lizard on your knee, sitting there as though he owned the place, which he did.' },
      ] },
    { id: 'plantation', t: 'Stay at a sugar plantation', d: 2, spot: 'cane',
      intro: 'A sugar planter on the isthmus took you in, and showed you his cane fields, miles of them, green as a meadow, and his mill, with its tall chimney smoking and its rollers crushing the cane, and talked sugar to you for two days: rainfall, yields, freight, and the price per pound in San Francisco.',
      c: [
        { t: 'Learn the business, figures and all', n: 4, fx: { sp: 3, hp: 6 }, r: 'You took it all down, and worked it out at night, and came to the conclusion that sugar was the future of these islands, and that the planters intended it should be, whatever the islands might think about it. It made a very sound letter. The Union printed it in full and the planters bought fifty copies.' },
        { t: 'Ride the fields at harvest time', n: 2, fx: { sp: 8, hp: -2 }, r: 'You rode out to the harvest, where gangs of men cut the cane with machetes in the heat and loaded it on carts for the mill. They had been at it since before dawn. You rode back to the veranda for lemonade and felt a good deal less of a capitalist than you had at breakfast.' },
        { t: 'Ask the planter about his labour contracts', n: 3, fx: { sp: 4, trouble: 6 }, r: 'You asked the planter, mildly, about the men in his fields, who were bound to him by contract for years at a few dollars a month, and what became of a man who wanted to leave. The planter explained it all, at length, and the explanation did not improve on acquaintance. The letter you wrote about it was not printed in full, and the planter did not buy any copies.' },
      ] },
  ],
};
const ISLE_EVENTS = [
  { t: 'A centipede', b: 'You woke in the night to find a centipede six inches long, with forty legs and a temper to match, walking across your pillow with the air of a man going home to his own house. You left the bed to him.', fx: { hp: -3, sp: 2 }, flag: 'bugs' },
  { t: 'A scorpion', b: 'A scorpion had taken up lodgings in your boot. You and the scorpion found this out at the same moment, and neither of you was pleased with the arrangement.', fx: { hp: -6, sp: 2 }, flag: 'bugs' },
  { t: 'Mosquitoes', b: 'The mosquitoes of the islands are the size of small birds and work in shifts. You slept under a net and they sat on top of it all night, waiting, like a sheriff’s posse outside a saloon.', fx: { hp: -4 } },
  { t: 'Poi', b: 'Your hosts served poi, the paste of pounded taro root that is the bread of the islands. It is eaten with the fingers: one-finger poi, or two-finger poi, according to how thick it is. You ate it bravely the first day, and by the third you were asking for it.', fx: { hp: 4, sp: 4 } },
  { t: 'A feast', b: 'You were asked to a feast: a pig roasted underground in an oven of hot stones, fish baked in leaves, sweet potatoes, bananas and poi, all spread on mats under the trees, and singing afterwards that went on long after the moon was up.', fx: { hp: 6, sp: 10 }, notes: 1 },
  { t: 'A legend of Pele', b: 'Your guide told you about Pele, the goddess of the volcano, who lives in the fire pit, and walks the islands as an old woman or a young girl, and does not like to be spoken of lightly. He told it with great seriousness. You resolved to be very polite on the mountain.', fx: { sp: 5 }, notes: 1 },
  { t: 'Mail from home', b: 'A ship came in with mail. Your mother wrote to ask whether you were eating properly and whether the natives were friendly. You wrote back that they were a great deal friendlier than the people of San Francisco, and fed you better.', fx: { sp: 8 } },
  { t: 'Saddle-sore', b: 'Days of riding had raised saddle boils on you of a size and severity that a doctor in Honolulu described, with professional admiration, as remarkable. You learned to sit down in stages.', fx: { hp: -7 }, flag: 'boils' },
];
// resting on the beach: 40% of the time something comes along
const BEACH = [
  { t: 'A falling coconut', b: 'A coconut came down out of the palm you were lying under and landed six inches from your ear with a sound like a cannon going off in a cellar. You moved, with thanks, to a tree with nothing in it.', fx: { sp: 4 } },
  { t: 'A crab of enterprise', b: 'A large land crab came out of a hole while you dozed, took one of your stockings, and went back into the hole with it. You negotiated at the mouth of the hole for some time. The crab kept the stocking.', fx: { sp: 6 } },
  { t: 'A swimming race', b: 'A crowd of children asked you to judge a swimming race out to the reef and back.', c: [
    { t: 'Judge it fairly', r: 'You judged it fairly, and the winner was so pleased he gave you a fish, and the losers were so pleased with your fairness that they gave you three more. You ate fish for two days.', fx: { sp: 8, hp: 3 } },
    { t: 'Declare it a tie all round', r: 'You declared everybody the winner, which was received with scorn by every child on the beach, and you learned that children are the same in every country and will not be flattered.', fx: { sp: 3 } } ] },
  { t: 'A missionary lady', b: 'A missionary lady stopped on the beach road and asked you, kindly but firmly, whether you did not think there were more useful things to do with a Tuesday than lie under a tree. You said you had given the question a great deal of thought, lying under the tree, and had not been able to think of any. She went on, and prayed for you, and it may have done some good.', fx: { sp: 3 } },
  { t: 'Surf riders', b: 'The surf riders came in on the evening waves, and one of them waded ashore and offered you his board.', c: [
    { t: 'Try once more', r: 'You tried once more, and this time stayed on the board for very nearly a second, which the young man said was a great improvement, and he was very kind about the rest.', fx: { sp: 8, hp: -4 }, flag: 'surf' },
    { t: 'Decline with dignity', r: 'You declined, with dignity, and watched him go back out and come in again standing up, as easy as a man walking down a street, and you thought it was the finest thing you had seen in the islands.', fx: { sp: 4 } } ] },
  { t: 'The fishermen’s net', b: 'Fishermen were hauling in a great net from the shallows, a dozen men on each wing, singing as they pulled.', c: [
    { t: 'Lay hold and pull with them', r: 'You laid hold and pulled, and sang too, without knowing the words, and when the net came in full of silver fish they gave you a share as if you had earned it, which you had, a little.', fx: { sp: 9, hp: 3 }, notes: 1 },
    { t: 'Watch and take notes', r: 'You watched, and took notes, and the fishermen took you for a government man and were very polite and careful all afternoon.', fx: { sp: 4 }, notes: 1 } ] },
  { t: 'A stinger', b: 'You waded out into the shallows to cool your feet and stepped on something that took a poor view of it. Your foot swelled up like a German sausage and stayed so for two days.', fx: { hp: -6 } },
  { t: 'A rain squall', b: 'A squall came over the hills, wet you through in four minutes, and went on; and twenty minutes later you were dry in the sun again. It happened four times before dinner, and you stopped minding after the second.', fx: { sp: 3 } },
  { t: 'A whaler on a spree', b: 'A whaleman ashore on a spree came down the beach, observed that you were lying in his favourite spot, and offered to fight you for it.', c: [
    { t: 'Give him the spot', r: 'You gave him the spot, with a bow, and he was so astonished by your manners that he sat down and told you about the Arctic for two hours, and fell asleep in the middle of a whale.', fx: { sp: 6 }, notes: 1 },
    { t: 'Talk him out of it', r: 'You talked to him about Nantucket, and his mother, and the price of oil, until he forgot what he had come for, and went off down the beach wiping his eyes, and you have never been prouder of an argument.', fx: { sp: 8 } } ] },
  { t: 'A sea turtle', b: 'A great green sea turtle came up out of the surf at dusk and lay on the sand near you, breathing, and looked at you with an old, tired, patient eye, as though you were not the first idler it had seen on that beach, and would not be the last.', fx: { sp: 7 }, notes: 1 },
  { t: 'A trader in shells', b: 'A trader came along the beach with a basket of shells, every one of which, he said, was rare and could not be had at any price, and was for sale at a dollar.', c: [
    { t: 'Buy one for your mother', r: 'You bought a shell for your mother. Later you found a hundred like it on the beach, but you sent her that one anyway, because it had cost a dollar and was therefore the best.', fx: { money: -1, sp: 5 } },
    { t: 'Haggle him to a bit', r: 'You beat him down from a dollar to twelve and a half cents, and he went off well satisfied, which told you everything you needed to know about the shell trade.', fx: { sp: 6 } } ] },
  { t: 'The trade wind takes your hat', b: 'The trade wind came round a point and took your hat off the sand and carried it down the beach, and you went after it, and so did six dogs and a small boy, and the boy won, and you paid him a bit to give it back.', fx: { sp: 5, hp: -1 } },
  { t: 'A rainbow', b: 'After a shower a rainbow stood up over the valley behind you, the whole arch of it, so bright and so near that you could see where it came down in a taro patch. You did not go and look for the pot of gold. You had been to Washoe.', fx: { sp: 8 } },
  { t: 'An old woman’s chant', b: 'An old woman sat down near you in the shade and began to chant, softly, to herself, a long song that went on and on like the surf. When you asked her what it was, she said it was the names of her family, back to the beginning of the world. She had got as far as the year 1100.', fx: { sp: 7 }, notes: 1 },
  { t: 'A whale off the reef', b: 'A whale spouted outside the reef, and then breached, the whole huge body of him coming up out of the sea and falling back in a burst of white, and every soul on the beach stood up and cheered him, and you did too.', fx: { sp: 9 }, notes: 1 },
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
    body: (note || '') + `<p>${S.isle === 'oahu' ? 'Honolulu drowses in the sun under its palms, like a planter after dinner. There is always a horse to hire, a veranda to sit on, and somebody on the veranda with a story he has been saving for a stranger.' : S.isle === 'hawaii' ? 'The biggest island of the group: black lava, green coast, snow on the high mountains in the tropics, which nobody at home will believe, and the volcano always smoking off in the distance like a steamboat with her fires banked.' : 'Two great mountains joined by a low green isthmus of cane fields, and over the whole of it the vast slope of Haleakala, which takes up more of the sky than any one mountain has a right to.'}</p>`,
    choices: [
      ...(hornetReady ? [{ t: '⚑ News at the harbour: survivors of a shipwreck!', big: true, go: () => { hornet(); } }] : []),
      ...acts.map(a => ({ t: a.t, sub: `${a.d} day${a.d > 1 ? 's' : ''}`, disabled: a.d > left, go: () => doAct(a) })),
      { t: 'Write a letter to the Union', sub: S.notes ? `a day at the desk; turns up to 3 notes into a letter ($20)` : 'you have no notes; go and see something first', disabled: !S.notes, go: () => writeUnion() },
      { t: 'Rest a day on the beach', sub: '+health, +spirits, and whatever comes along', go: () => { restOnBeach(); } },
      ...Object.keys(ISLES).filter(k => k !== S.isle).map(k => ({ t: `Sail to ${ISLES[k].name}`, sub: 'an inter-island schooner, 2 days, $10', disabled: S.money < 10 || left < 3, go: () => sailTo(k) })),
      { t: 'Book passage home to San Francisco', sub: 'end your stay in the islands', if: () => S.pday >= 14, go: () => { sailHome(false); } },
    ],
  });
}
function doAct(a) {
  S.done.push(a.id); S.pday += a.d; S.day += a.d;
  if (a.go) return a.go(); // the volcano and Haleakala are set pieces of their own
  scene.set('island', { spot: a.spot });
  show({
    title: a.t, where: `${ISLES[S.isle].name} · ${a.d} day${a.d > 1 ? 's' : ''}`, body: `<p>${a.intro}</p>`,
    choices: a.c.map(c => ({ t: c.t, go: () => {
      if (c.flag) S.flags[c.flag] = 1;
      S.notes += c.n;
      let html = `<p>${c.r}</p>` + fx(c.fx) + `<p class="fx">+${c.n} note${c.n > 1 ? 's' : ''}</p>`;
      const ev = Math.random() < .4 ? deal(ISLE_EVENTS) : null;
      if (ev) { html += `<h3 style="font-family:Rye,serif;font-weight:normal;color:var(--red);margin:14px 0 0">${ev.t}</h3><p>${ev.b}</p>` + fx(ev.fx); if (ev.notes) { S.notes += ev.notes; html += '<p class="fx">+1 note</p>'; } if (ev.flag) S.flags[ev.flag] = 1; }
      return html;
    }, next: () => isleHub() })),
  });
}
const REST = [
  'You lay all day in the shade of a hau tree on the sand, with the trade wind in the palms and the surf going over the reef like distant cannon, and did nothing whatever, and did it thoroughly.',
  'You spent the day on the beach in a state of perfect idleness, which is a thing very hard to come by in America, where even the idle are generally in a hurry about it.',
  'You lay on the beach and watched the clouds stand over the mountains, and counted it the best-spent day of the year, there being no stock board within two thousand miles.',
];
function restOnBeach() {
  S.pday++; S.day++;
  scene.set('island', { spot: 'beach' });
  const notes = n => n ? `<p class="fx">+${n} note</p>` : '';
  if (Math.random() >= .4) return outcome('A day on the beach', `<p>${pick(REST)}</p>` + fx({ hp: 6, sp: 5 }), () => isleHub());
  const e = deal(BEACH);
  if (!e.c) { if (e.notes) S.notes += e.notes; return outcome(e.t, `<p>${e.b}</p>` + fx({ hp: 3, ...e.fx }) + notes(e.notes), () => isleHub()); }
  show({ title: e.t, where: 'On the beach', body: `<p>${e.b}</p>`, choices: e.c.map(c => ({ t: c.t, go: () => { if (c.flag) S.flags[c.flag] = 1; if (c.notes) S.notes += c.notes; return `<p>${c.r}</p>` + fx({ hp: 3, ...c.fx }) + notes(c.notes); }, next: () => isleHub() })) });
}
function writeUnion() {
  const n = Math.min(3, S.notes); S.notes -= n; S.letters++; S.pday++; S.day++;
  const r = Math.round(n * 11 * rnd(.85, 1.2) * (has('notebook') ? 1.1 : 1) * (S.flags.harte ? 1.1 : 1));
  log(`Sent letter no. ${S.letters} to the Union.`);
  outcome(`Letter no. ${S.letters}`, `<p>${pick(['You wrote all day at a table on the veranda, in your shirtsleeves, with a pitcher of lemonade and a lizard for company, and the lizard offered no criticisms.', 'You wrote it at one sitting, from breakfast to supper, and it was the best thing you had done in months, or so it seemed at supper.', 'You filled twenty pages and sent them off by the next ship. In Sacramento they would set it in type, and a month from now the whole coast would be reading it at breakfast and spilling coffee on it.'])}</p>` + fx({ money: 20, readers: r, sp: 3 }), () => isleHub());
}
function sailTo(k) {
  S.pday += 2; S.day += 2; S.money -= 10; S.isle = k;
  scene.set('ocean', { schooner: true });
  outcome(`To ${ISLES[k].name}`, `<p>${pick(['The inter-island schooner was small and crowded, and smelt powerfully of oranges, pigs and sugar. Everybody aboard was seasick except the pigs, who had made the passage before.', 'You slept on deck among sacks of potatoes and a family going to visit relatives, who shared their dinner with you and laughed at your seasickness, though kindly, and gave you a lemon for it.', 'A long night rolling in the channel between the islands, and at dawn a new coast, green and black, with the surf breaking white along the whole length of it.'])}</p>` + fx({ hp: -4, money: 0 }), () => isleHub());
}

function volcano() {
  scene.set('volcano', {});
  show({
    title: 'Kilauea', where: 'The volcano house, on the rim of the crater, after dark',
    body: `<p>You rode up through forest and fern into a strange country of cracked black lava, steaming vents and sulphur, to a grass-roofed hotel on the very rim of the crater, kept by a man who appeared to think nothing of it. At nightfall you went out and looked over the edge.</p><p>Below you lay a pit nine miles round and a thousand feet deep, its floor a vast black plain cracked across and across with rivers of fire. In the middle of it the lake of fire itself was boiling: a great red cauldron flinging up fountains of molten lava that splashed and fell back in showers of light, while the glare on the clouds overhead turned the night into a red day. You could read your notebook by it a mile off, and you did, to make sure.</p>`,
    choices: [
      { t: 'Climb down to the crater floor with a guide', go: () => { S.flags.volcano = 2; S.notes += 4; feat('Walked on the floor of Kilauea'); return `<p>At midnight, with a lantern and a guide, you climbed down the cliff and walked out across the crust of the crater floor. It was warm through your boot-soles. Through the cracks you could see the fire running underneath, a foot down, like the inside of a stove. At the edge of the lake you stood in the glare with your face scorching and watched the fountains rise and fall, until the guide, who was not afraid of anything on earth, said in a low voice that you had better step back. You did not argue the point.</p>` + fx({ sp: 18, hp: -8 }) + '<p class="fx">+4 notes</p>'; } },
      { t: 'Watch from the rim all night', go: () => { S.flags.volcano = 1; S.notes += 3; return `<p>You sat on the rim wrapped in a blanket till dawn, watching the fire move and change below you, and never once thought of the stock board. It was the most magnificent thing you had ever seen, and you had seen the Washoe Zephyr take the roof off a church.</p>` + fx({ sp: 15 }) + '<p class="fx">+3 notes</p>'; } },
    ],
  }, () => isleHub());
}
function haleakala() {
  scene.set('summit', {});
  show({
    title: 'Haleakala', where: 'Ten thousand feet up, before dawn',
    body: `<p>You rode up the long slope of Haleakala all afternoon, slept, or tried to, in a stone pen near the summit with the wind howling and the cold coming up out of the ground like a Sierra winter that had lost its way, and got up at four to see the sun rise.</p><p>The crater of the great mountain lay below you: a gulf twenty miles round and two thousand feet deep, with cinder cones standing in it like pyramids. And as the sky went grey you saw that the clouds had come in beneath you and filled the whole world from edge to edge, a white, still sea of cloud with the peaks standing out of it like islands.</p>`,
    choices: [
      { t: 'Wait for the sun', go: () => { S.flags.haleakala = 1; S.notes += 3; feat('Saw the sunrise from Haleakala'); return `<p>The sun came up. The sea of cloud went pink, then gold, then a white you could not look at; the shadows of the cinder cones stretched out for miles across the crater floor; and for a quarter of an hour you forgot that you were cold, or tired, or a newspaperman. It was the most sublime spectacle you had ever witnessed, and you wrote that down, and then struck it out, because it did not come anywhere near.</p>` + fx({ sp: 18, hp: -4 }) + '<p class="fx">+3 notes</p>'; } },
      { t: 'Roll boulders into the crater with the others', go: () => { S.flags.haleakala = 1; S.notes += 2; return `<p>While you waited for the sun, you and your companions amused yourselves rolling great boulders off the rim and watching them bound down two thousand feet into the crater, raising dust like cannon shot. It was the kind of thing grown men will do on a mountain, and you did it till your arms gave out. Then the sun came up and made you ashamed of yourselves, for a while.</p>` + fx({ sp: 14, hp: -2 }) + '<p class="fx">+2 notes</p>'; } },
    ],
  }, () => isleHub());
}
function hornet() {
  S.flags.hornet = 1;
  scene.set('island', { harbor: true });
  show({
    title: 'The Hornet', where: 'Honolulu, June 1866',
    body: `<p>News ran through the town: fifteen men had come ashore on the island of Hawaii in an open boat, the last survivors of the clipper <i>Hornet</i>, which had burned at sea six weeks before. They had been forty-three days in the boat on ten days’ rations. They were being brought to Honolulu now.</p>
      <p>It was the biggest story in the Pacific, and every paper in San Francisco would have given its eye teeth for it. And you ${S.flags.boils ? 'could not walk: your saddle boils had put you flat on your back' : 'were laid up with a fever and could hardly stand'}. A ship sailed for San Francisco in the morning.</p>`,
    choices: [
      { t: 'Have yourself carried to the hospital on a cot', go: () => { S.notes += 2; feat('Got the Hornet scoop'); addBonus(50); log('Scooped the Hornet story.'); return `<p>Anson Burlingame, the American minister to China, who was passing through on the way to his post and had taken a liking to you, had you carried to the hospital on a cot and helped you interview the survivors. They told you everything: the fire, the boats, the hunger, and the captain who kept the log and kept them alive. You wrote all day and all night without stopping, and at dawn your bundle of pages was flung aboard the schooner just as she cast off.</p><p>It was the first full account to reach the States. The <i>Union</i> printed it across three columns and paid you ten times your rate. Overnight you were the man who got the <i>Hornet</i> story, and nobody remembered that you had got it lying down.</p>` + fx({ readers: 90, money: 300, hp: -6, sp: 15 }); } },
      { t: 'Rest, and let the other correspondents have it', go: () => `<p>You rested. The story went to San Francisco in somebody else’s pocket. It was the sensible thing to do, and you never entirely forgave yourself for being sensible.</p>` + fx({ hp: 10, sp: -12 }) },
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
  outcome('Homeward', `<p>${forced ? 'Your time was up, and your money nearly so.' : 'You had seen what you came to see.'} You sailed for home on a slow sailing ship that took three weeks and a half to cross the same sea the <i>Ajax</i> had crossed in eleven days. The wind died for days at a time. You spent them on deck ${unwritten ? `writing up your last ${unwritten} notes, ` : ''}watching the ocean change colour and thinking about money, which did not change colour or anything else.</p>
    <p>You had written ${S.letters} letters to the <i>Union</i>, and you had a name that people knew up and down the coast; and you had no job, and nothing to live on, and no more notion what to do next than the ship had of a breeze.</p>
    <p>A friend in San Francisco said: why not give a lecture about the islands? You had never given a lecture in your life, and said so, and he said that was no objection in California.</p>`, () => lecture());
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
  { k: 'dead', n: 'deadpan', sub: 'grave and slow, like a deacon reading the minutes, as if you had no notion it was funny', m: [1.15, 1.5] },
  { k: 'grin', n: 'with a grin', sub: 'let them see you enjoy it, the way a drummer laughs at his own stories', m: [.6, 1.1] },
  { k: 'pause', n: 'with a long pause before the end', sub: 'risky: wait till the silence is so long the gallery begins to shift in its seats', m: [.5, 1.8] },
];
function lecture() {
  S.act = 'lecture'; setDate(1866, 10, 2);
  scene.set('hall', {});
  show({
    title: 'The trouble begins at eight', where: 'San Francisco, October 2, 1866',
    body: `<p>You rented the biggest hall in the city, Maguire’s Academy of Music, for fifty dollars, half of it borrowed. You had handbills printed and posted all over town, announcing a lecture on the Sandwich Islands by Mark Twain, and closing with a line you were rather proud of: <b>Doors open at 7 o’clock. The trouble will begin at 8.</b></p>
      <p>Then you spent three days in a cold sweat, convinced that nobody would come, or, what was worse, that they would come and not laugh.</p>`,
    choices: [
      { t: 'Plant friends in the audience to laugh on your signal', sub: 'insurance; also a risk', go: () => { S.flags.claque = 1; return `<p>You arranged with some large friends from the mines to sit in the parquette and laugh when you looked at them, and with a kind lady in a box to laugh whenever you turned your head toward her, whether the joke deserved it or not. It made you feel safer, by about the width of a hair.</p>`; }, next: lectureBits },
      { t: 'Trust the material', go: () => `<p>You decided that if the stories were good they would laugh, and if they were not you deserved what you got. It was a very brave decision, and you regretted it every hour on the hour until the doors opened.</p>` + fx({ sp: -4 }), next: lectureBits },
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
      ${chosen.length ? `<p>So far: ${chosen.map(c => `<i>${c.b.n}</i> (${c.d.n})`).join(', ')}.</p>` : `<p>The hall is filling. You can hear them through the curtain, a great murmuring crowd clear up to the gallery, like the Mississippi coming up in the spring, and your knees have begun to hold opinions of their own.</p>`}
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
    if (c.b.serious) { v = c.b.v * 1.2; lines.push(`<p><b>${c.b.n}.</b> The hall went perfectly still. You could hear the gas jets hiss. When you finished there was a long silence, and then a great warm wave of applause, like surf coming in over a reef.</p>`); }
    else {
      if (prevSerious) v *= 1.35;
      if (i === chosen.length - 1 && c.b.v >= 8) v *= 1.3;
      if (S.flags.claque && Math.random() < .25) { v *= .7; lines.push(`<p><b>${c.b.n}.</b> You glanced at the lady in the box to cue her, at a perfectly solemn moment, and she let go a great ringing laugh on cue, and the whole house laughed at her, and at you, and then at the story, though not quite in the right place.</p>`); }
      else lines.push(`<p><b>${c.b.n}.</b> ${v > 11 ? 'The house came apart. Men in the gallery held on to one another. A gentleman in the front row laughed till he had to be helped out, and came back in to hear the rest.' : v > 8 ? 'A big laugh, rolling up from the parquette to the gallery and back down again, like thunder going round a canyon.' : v > 5 ? 'A good laugh, and a few people said the last line over to each other.' : 'A polite ripple, and a cough in the dress circle, and you pressed on.'}</p>`);
    }
    prevSerious = !!c.b.serious; total += v;
  });
  const laughs = Math.round(total);
  const take = Math.round(400 + laughs * 22);
  addBonus(laughs * 4);
  if (laughs >= 34) feat('Brought the house down');
  sfx('fanfare');
  outcome('Mark Twain, lecturer', `<p>You walked out onto the stage in front of fifteen hundred people. Your mouth was as dry as an alkali flat, your hands were cold, and the first thing you said came out a croak. Then they laughed at the croak, and you were all right.</p>${lines.join('')}
    <p>When it was over the applause went on so long that you did not know whether to bow, leave, or begin again. The box office took in <b>${money(take)}</b>. Next morning every paper in the city said the same thing in different words: there had never been anything quite like it on the coast.</p>
    <p>So you had found your trade at last, after trying all the others; and it had cost you no more than a stagecoach, a silver mine, two newspapers, a frog, a volcano and five years.</p>` + fx({ money: take - 50, readers: laughs * 3, sp: 20 }), () => ending('lecture'));
}

window.EXTRA_ENDINGS = {
  lecture: ['The trouble began at eight', `<p>From San Francisco you took the lecture on the road, to Sacramento, to the mining camps, and back over the Sierra to Virginia City, where they turned out to cheer one of their own and to see whether you still owed anybody money. Then East, and a voyage to Europe and the Holy Land in a steamship full of pilgrims, and a book about that; and at last, at a desk with a box of old notebooks, a book about the West, the stage, the silver and the islands: <i>Roughing It</i>.</p><p>You left out nothing important, and put in a great many things that were better than the truth.</p>`],
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

// the road west: a freight wagon and its mule team, and the Folsom train
const wagonBody = () => A.spr('wagon', 50, 30, x => {
  A.rect(x, 2, 14, 42, 8, '#7a5a3a'); A.rect(x, 2, 14, 42, 1, '#9a7a52'); for (let i = 6; i < 44; i += 7) A.rect(x, i, 15, 1, 7, '#5a3f25');
  A.ell(x, 23, 10, 21, 7, '#e8e0cc'); A.rect(x, 2, 10, 42, 4, '#e8e0cc'); for (const hx of [8, 23, 38]) A.rect(x, hx, 4, 1, 10, '#c8c0a8');
  A.rect(x, 42, 9, 6, 2, '#5a3f25'); A.rect(x, 44, 2, 4, 7, '#6a5a4a'); A.rect(x, 43, 0, 6, 2, '#3a2616'); A.rect(x, 44, -1, 4, 2, '#3a2616');
}, '#1e140c');
const loco = () => A.spr('loco', 62, 30, x => {
  A.rect(x, 2, 4, 15, 18, '#9b2d20'); A.rect(x, 0, 2, 19, 3, '#3a2616'); A.rect(x, 5, 7, 8, 6, '#e8c870');
  A.rect(x, 17, 10, 30, 10, '#2e3a32'); for (const bx of [22, 32, 42]) A.rect(x, bx, 10, 2, 10, '#c9a040');
  A.circ(x, 33, 9, 3, '#c9a040'); A.poly(x, [[41, 10], [38, 1], [50, 1], [46, 10]], '#2a2a2a'); A.rect(x, 37, 0, 14, 2, '#2a2a2a');
  A.rect(x, 47, 12, 6, 4, '#e8e0c0'); A.poly(x, [[47, 20], [60, 26], [47, 26]], '#7a2218'); A.rect(x, 2, 20, 50, 2, '#2a1d12');
}, '#120a06');
const railcar = v => A.spr('car' + v, 44, 24, x => {
  A.rect(x, 1, 6, 42, 12, '#d9a441'); A.rect(x, 0, 3, 44, 3, '#5a3a22'); A.rect(x, 3, 1, 38, 2, '#5a3a22');
  for (let wx = 4; wx < 40; wx += 6) A.rect(x, wx, 8, 4, 5, '#3a4a5a'); A.rect(x, 1, 16, 42, 2, '#7a2218'); A.rect(x, 1, 18, 42, 2, '#2a1d12');
}, '#1e140c');
function roadDraw(g, t, px, o, moving, offset) {
  if (o.lake) { for (let y = 86; y < 101; y++) for (let x = 0; x < 320; x += 1) { const s = A.h2((x + t * 6) | 0, y); g.fillStyle = s > .97 ? '#8ac0e0' : '#2e6fa8'; g.fillRect(x, y, 1, 1); } }
  if (o.valley) for (let i = 0; i < 6; i++) { const x = ((i * 71 - offset * .6) % 380 + 380) % 380 - 30; g.drawImage(A.oak(i), Math.round(x), 84 + (i % 3) * 5); }
  if (o.snow) for (let i = 0; i < 9; i++) { const x = ((i * 41 - offset) % 360 + 360) % 360 - 20; g.fillStyle = '#eef2f5'; g.beginPath(); g.ellipse(x, 120, 16, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = '#c8d4dc'; g.fillRect(Math.round(x) - 14, 119, 28, 1); }
  if (o.freight) {
    const x = 96, gy = 128, bob = moving ? Math.round(Math.sin(t * 6)) : 0;
    g.fillStyle = 'rgba(40,25,10,.2)'; g.fillRect(x, gy - 1, 150, 3);
    const coats = ['#7a7068', '#6a5a4a', '#8a8078'];
    for (let i = 2; i >= 0; i--) { const hx = x + 50 + i * 24, f = moving ? Math.floor(t * 6 + i * 2) % 6 : -1; g.drawImage(A.horse(f, coats[i], true), hx, gy - 21); A.pline(g, hx - 2, gy - 13, hx + 4, gy - 13, '#2a1d12'); }
    g.drawImage(wagonBody(), x, gy - 34 + bob);
    const a = moving ? t * 4 : 0; A.wheel(g, x + 10, gy - 9, 9, a); A.wheel(g, x + 38, gy - 7, 7, a * 1.3);
  }
  if (o.train) {
    const x = ((t * 46) % 600) - 200, gy = 128;
    g.fillStyle = '#5a4a3a'; g.fillRect(0, gy - 2, 320, 2); g.fillStyle = '#3a2a1a'; for (let i = 0; i < 320; i += 6) g.fillRect(i, gy, 4, 2);
    for (let c = 0; c < 3; c++) { const cx = x - 48 - c * 46; g.drawImage(railcar(c), Math.round(cx), gy - 26); A.wheel(g, cx + 8, gy - 4, 3, t * 10); A.wheel(g, cx + 36, gy - 4, 3, t * 10); }
    g.drawImage(loco(), Math.round(x), gy - 30); A.wheel(g, x + 22, gy - 6, 6, t * 8); A.wheel(g, x + 36, gy - 6, 6, t * 8); A.wheel(g, x + 50, gy - 3, 3, t * 12);
    for (let i = 0; i < 8; i++) { const a = (t * .9 + i / 8) % 1; g.fillStyle = `rgba(220,215,205,${(1 - a) * .7})`; g.beginPath(); g.arc(x + 44 - a * 40, gy - 32 - a * 20, 2 + a * 6, 0, 7); g.fill(); }
  }
}

Object.assign(window.SCENES, {
  sierraroad: { pal: { sky: ['#7cb2da', '#e8f0ea'], far: '#6f8197', mid: '#3e5a41', ground: '#8a7f5e', dot: '#2f4a32', pines: true, snow: true }, draw: roadDraw },
  valley: { pal: { sky: ['#8ec0e0', '#f6e8c0'], far: '#a89a70', mid: '#b8a060', ground: '#c8b07a', dot: '#7a7a40', hills: true }, draw: (g, t, px, o, m, off) => roadDraw(g, t, px, { ...o, valley: true }, m, off) },
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
      const s = o.spot;
      if (o.mountain || s === 'iao' || s === 'falls' || s === 'cane') {
        A.poly(g, [[40, 92], [120, 40], [168, 30], [220, 42], [300, 92]], '#4e6a52');
        A.poly(g, [[168, 30], [220, 42], [300, 92], [200, 92]], '#5f7d60');
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(40,70,46,.6)'; g.fillRect(60 + (i * 37) % 220, 70 + (i * 13) % 20, 2, 1); }
      }
      if (s === 'pali') {
        // the precipice: a green wall dropping away to the windward coast
        A.poly(g, [[0, 30], [150, 34], [176, 160], [0, 160]], '#3e6a3e'); A.poly(g, [[120, 34], [150, 34], [176, 160], [140, 160]], '#2e5232');
        for (let i = 0; i < 30; i++) { g.fillStyle = '#5a8a4a'; g.fillRect((i * 19) % 130, 40 + (i * 23) % 110, 4, 2); }
        g.fillStyle = '#3a2616'; g.fillRect(132, 22, 4, 10); g.fillStyle = '#e0c08a'; g.fillRect(132, 19, 4, 3);
        const hx = 150 + ((t * 20) % 170), hy = 14 + Math.sin(t * 3) * 6; g.fillStyle = '#3a2616'; g.fillRect(Math.round(hx), Math.round(hy), 6, 2); g.fillRect(Math.round(hx) + 1, Math.round(hy) - 2, 4, 2);
        return;
      }
      // reef surf and the beach edge
      for (let x = 0; x < 320; x++) { const w = Math.sin(x * .12 + t * 2) + Math.sin(x * .05 - t); if (w > .9) { g.fillStyle = '#ffffff'; g.fillRect(x, 92 + (w > 1.5 ? 0 : 1), 1, 1); } }
      g.fillStyle = 'rgba(255,255,255,.85)'; for (let x = 0; x < 320; x += 2) g.fillRect(x, 103 + Math.round(Math.sin(x * .2 + t * 3)), 2, 1);
      if (s === 'surf') for (let i = 0; i < 4; i++) { const x = ((t * (18 + i * 4) + i * 90) % 360) - 20, y = 94 + (i % 2) * 4; g.fillStyle = '#c9a040'; g.fillRect(Math.round(x), y + 3, 12, 2); g.fillStyle = '#6a4a2a'; g.fillRect(Math.round(x) + 5, y - 3, 3, 6); g.fillStyle = '#ffffff'; g.fillRect(Math.round(x) - 6, y + 4, 8, 1); }
      else if (!s || s === 'beach' || s === 'whalers') g.drawImage(canoe(), Math.round(((t * 6) % 380) - 40), 92);
      if (s === 'whalers') { g.drawImage(A.ship(0), 20, 46); g.drawImage(A.ship(1), 110, 42); g.drawImage(A.ship(2), 210, 48); }
      if (s === 'legis') { g.fillStyle = '#e8e4d8'; g.fillRect(90, 76, 120, 40); g.fillStyle = '#c8c0b0'; for (let x = 96; x < 206; x += 12) g.fillRect(x, 84, 4, 32); g.fillStyle = '#8a6a4a'; g.fillRect(86, 72, 128, 5); g.fillStyle = '#3a2616'; g.fillRect(146, 100, 10, 16); g.fillRect(150, 44, 1, 30); for (let k = 0; k < 8; k++) { g.fillStyle = ['#f4f4f4', '#c8302a', '#2a3a8a'][k % 3]; g.fillRect(151, 44 + k, 16, 1); } g.fillStyle = '#2a3a8a'; g.fillRect(151, 44, 7, 4); }
      if (s === 'riders') for (let i = 0; i < 6; i++) { const x = ((t * (60 + i * 7) + i * 64) % 420) - 40, f = Math.floor(t * 14 + i) % 6; g.drawImage(A.horse(f, ['#7a4a2a', '#4a3020', '#9a7a52'][i % 3]), Math.round(x), 120 + (i % 3) * 8 - 21); g.fillStyle = ['#c8302a', '#e8b020', '#2a8a6a', '#a040a0'][i % 4]; g.fillRect(Math.round(x) + 11, 120 + (i % 3) * 8 - 26, 6, 8); g.fillStyle = '#6a4a2a'; g.fillRect(Math.round(x) + 13, 120 + (i % 3) * 8 - 30, 3, 3); g.fillStyle = '#f0a0c0'; g.fillRect(Math.round(x) + 12, 120 + (i % 3) * 8 - 31, 5, 1); }
      if (s === 'horse') { const x = ((t * 22) % 400) - 40, f = Math.floor(t * 6) % 6; g.drawImage(A.horse(f, '#8a7a6a'), Math.round(x), 99); g.fillStyle = '#e8e0d0'; g.fillRect(Math.round(x) + 11, 94, 6, 7); g.fillStyle = '#e0c08a'; g.fillRect(Math.round(x) + 13, 90, 3, 3); g.fillStyle = '#c8b890'; g.fillRect(Math.round(x) + 11, 89, 7, 1); }
      if (s === 'kona') { g.fillStyle = '#1e1a1a'; g.fillRect(0, 100, 320, 10); for (let x = 0; x < 320; x += 4) g.fillRect(x, 98 + (x * 7) % 3, 4, 3); for (let i = 0; i < 9; i++) { const x = 14 + i * 34; A.circ(g, x, 118, 6, '#2f5a2f'); for (let k = 0; k < 4; k++) { g.fillStyle = '#c8302a'; g.fillRect(x - 3 + k * 2, 116 + (k % 2) * 3, 1, 1); } } }
      if (s === 'cook') { g.fillStyle = '#1e1a1a'; g.fillRect(150, 100, 70, 8); g.fillStyle = '#5a3f25'; g.fillRect(186, 86, 4, 16); g.fillStyle = '#b87333'; g.fillRect(185, 90, 6, 4); A.poly(g, [[230, 104], [320, 40], [320, 104]], '#4a3a3a'); }
      if (s === 'refuge') { for (let x = 30; x < 290; x += 6) for (let y = 106; y < 120; y += 4) { g.fillStyle = A.hash(x * 7 + y) > .5 ? '#3a3434' : '#2a2626'; g.fillRect(x + (y % 8 ? 0 : 3), y, 5, 3); } for (const x of [60, 130, 220]) { g.fillStyle = '#5a3f25'; g.fillRect(x, 84, 5, 22); g.fillStyle = '#3a2616'; g.fillRect(x, 88, 5, 2); g.fillRect(x + 1, 92, 1, 2); g.fillRect(x + 3, 92, 1, 2); g.fillRect(x - 1, 84, 7, 3); } }
      if (s === 'falls') { g.fillStyle = '#3e6a3e'; g.fillRect(120, 40, 70, 64); for (let y = 44; y < 104; y++) { g.fillStyle = (y + Math.floor(t * 20)) % 4 ? '#e8f4fa' : '#a8d0e8'; g.fillRect(150, y, 8, 1); } g.fillStyle = '#5aa0c8'; g.beginPath(); g.ellipse(154, 106, 22, 4, 0, 0, 7); g.fill(); }
      if (s === 'iao') { A.poly(g, [[150, 92], [158, 34], [166, 30], [172, 40], [178, 92]], '#3e7a46'); A.poly(g, [[166, 30], [172, 40], [178, 92], [170, 92]], '#4e8a52'); }
      if (s === 'cane') { for (let y = 104; y < 130; y += 3) { g.fillStyle = y % 2 ? '#6a9a3a' : '#7aaa44'; g.fillRect(0, y, 320, 2); } g.fillStyle = '#8a7a6a'; g.fillRect(240, 62, 8, 44); g.fillStyle = '#c8b8a0'; g.fillRect(220, 90, 40, 18); puff(g, 244, 60, t, '#8a8a8a', 7, 30); }
      if (o.harbor) {
        g.fillStyle = '#6a5038'; g.fillRect(118, 100, 46, 3); for (let x = 120; x < 164; x += 6) g.fillRect(x, 103, 2, 6);
        g.drawImage(church(), 180, 120 - 46); g.drawImage(hut(0), 210, 102); g.drawImage(hut(1), 236, 104); g.drawImage(hut(2), 150, 106);
        g.drawImage(A.schooner(), 92, 56);
      } else if (!s || s === 'beach') { g.drawImage(hut(1), 200, 104); g.drawImage(hut(2), 226, 106); }
      if (!['kona', 'refuge', 'cane', 'legis', 'cook'].includes(s)) for (const [x, v] of [[2, 0], [44, 1], [262, 2], [290, 3]]) { const sway = Math.round(Math.sin(t * 1.1 + x) * 1); g.drawImage(A.palm(v), x + sway, 154 - 44); }
      if (s === 'beach') { g.fillStyle = '#c8a050'; g.fillRect(140, 136, 24, 3); g.fillStyle = '#e8e0d0'; g.fillRect(144, 132, 12, 4); g.fillStyle = '#e0c08a'; g.fillRect(156, 132, 4, 4); g.fillStyle = '#c8b890'; g.fillRect(156, 130, 5, 1); }
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
