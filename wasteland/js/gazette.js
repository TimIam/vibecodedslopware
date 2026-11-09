// The Wasteland Gazette: one story above the fold, changed every 15 days or when something big happens.
import { B, TECH, DAY } from './data.js';
import { buildingSprite, msvSprite, canvas } from './art.js';

const STORY_DAYS = 15;
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

function everyday(G, s, r) {
  const c = G.counts, pop = s.pop;
  const stories = [
    { head: `${s.name} Counts ${pop} Souls`, deck: 'Commission takes full credit; souls unavailable for comment',
      body: [`The Commission's latest headcount puts ${s.name} at ${pop} residents, ${s.sec} of them armed and paid in soup. Officials called the figure "a number" and moved on to item two, parking.`, `Residents queueing for the census reported a wait of several hours and a pencil shortage. "I was told to come back with my own pencil," said one. "Then I was told pencils were a Timber era concern."`], pic: 'outpost' },
    { head: 'Dust Expected To Continue', deck: 'Long-range outlook also dust, experts confirm',
      body: ['Forecasters at the Commission\'s weather desk, a man on a roof, say the dust that has fallen every day since the end of the world is likely to keep falling. "I would not rule out dust," he said, squinting.', 'Farmers took the news in stride. A spokesman for the tuber growers urged calm and recommended a hat.'], pic: 'farm' },
    { head: 'Commission Meeting Ends In Snacks', deck: 'Four-hour session reaches agreement on one item',
      body: ['Monday\'s meeting of the Planning Commission ended, after four hours and a recess, with a unanimous vote on the question of what to serve at the next meeting.', 'Eleven permits were tabled, one was denied on principle, and a motion to define "principle" was referred to a subcommittee that does not yet exist.'], pic: 'outpost' },
    { head: 'Security Chief: Perimeter "Mostly Surrounded"', deck: `${G.stats.hostilesKilled} hostiles turned away since founding`,
      body: [`The town's security chief briefed reporters from a folding chair, declaring the perimeter "mostly surrounded" and the mutant situation "ongoing but tall."`, `Asked whether officers had been told not to hug the mutants, the chief said a memo had gone out. Asked whether anyone had read it, the chief asked to see the memo.`], pic: 'guard' },
    { head: 'Salvage Crews Find Working Toaster', deck: 'Half-day holiday declared; toaster guarded around the clock',
      body: ['A crew clearing rubble near the old highway has recovered a toaster in full working order, the first since records began. The Commission declared a half day and asked the public to form an orderly line.', 'No bread has yet been located.'], pic: 'salvage' },
    { head: 'Letters: Why Does The Farm Smell Like A Farm?', deck: 'Readers write in; editor regrets asking',
      body: ['This week\'s mailbag was dominated by the question of the farm, its smell, and whether the Commission intends to do anything about either. The Commission replied that it does not.', 'In other correspondence, a reader wants it known that the left boot advertised last week was hers.'], pic: 'farm' },
  ];
  if (c.park) stories.push({ head: 'Residents Touch Grass', deck: 'Park visitors report "a strange and pleasant sensation"', body: ['For many it was the first grass in years. Crowds gathered at the edge of the new park and were, after some coaxing, persuaded to step on it.', 'The Commission reminds the public that the grass is not food.'], pic: 'park' });
  if (c.mall || c.store) stories.push({ head: 'Shelves Now Hold Things', deck: 'Shoppers delighted; nature of things unclear', body: ['The town\'s retailers report brisk trade in items described on their labels as "goods." Prices are steady at a lot.', 'One shopper said she came for a bucket and left with a different bucket.'], pic: c.mall ? 'mall' : 'store' });
  if (c.windmill) stories.push({ head: 'Wind Turbine Spins; Experts Credit Wind', deck: 'Critics of solar array say it is "just sitting there"', body: ['The town\'s electricity supply got a boost this week from a tall white object that goes round. Engineers attribute the effect to the wind, which remains free.', 'Lights stayed on throughout the debate.'], pic: 'windmill' });
  if (c.evplant) stories.push({ head: 'Electric Car Stops At Junction', deck: 'Crowd gathers to watch it go again', body: ['A new electric car came to a halt at the junction on Tuesday morning, drawing a crowd of several dozen, who cheered when it pulled away.', 'The EV owners\' club met that evening to discuss EVs.'], pic: 'evplant' });
  if (c.chickens || c.cattle) stories.push({ head: 'Battery Hens Decline To Comment', deck: 'Feedlot confirmed to be "a lot of cows"', body: ['Reporters visiting the town\'s new battery farms were given a tour of the outside of the building and a pamphlet.', 'Food stocks are up. Nobody at the Commission wishes to discuss it further.'], pic: c.chickens ? 'chickens' : 'cattle' });
  if (G.research.done.petro) stories.push({ head: 'Vinyl Siding Craze Sweeps Town', deck: '"Teal is back," declares man on ladder', body: ['Homeowners are lining up to clad their walls in colourful plastic, a trend the Commission describes as civilisation and the town\'s last bricklayer describes differently.', 'Salmon is expected to be big next year.'], pic: 'home' });
  return pick(stories, r);
}
function major(G, n, s) {
  if (n.k === 'tech') {
    const t = TECH[n.id], un = Object.values(B).filter((b) => b.tech === n.id);
    return { head: `Commission Masters ${t.name}`, deck: un.length ? `${un.map((b) => b.name).join(' and ')} now in the blueprints` : 'Experts say it was difficult',
      body: [`After long study the town's tinkers have finished their work on ${t.name.toLowerCase()}. ${t.desc}`, n.id === 'reconstruction' ? 'Bricklayers wept openly. Scrap merchants could not be reached.' : n.id === 'carpentry' ? 'It is hoped that nails will follow.' : 'The Commission has scheduled a meeting to decide who gets the credit.'], pic: un.length ? un[0].id : 'tinker' };
  }
  if (n.k === 'first') { const d = B[n.type]; return { head: `${d.name} Opens In ${s.name}`, deck: 'Ribbon cut with salvaged scissors', body: [`Residents turned out in numbers to see the first ${d.name.toLowerCase()} open its doors. ${d.desc}`, 'A speech was given. It was long.'], pic: n.type }; }
  if (n.k === 'raid') return { head: `Raiders Strike ${s.name}`, deck: `${n.n} armed bandits sighted; officers called to posts`, body: [`A band of ${n.n} raiders was seen advancing on the town this week. Security officers took up positions while civilians sheltered behind the nearest wall.`, 'Anyone finding crates of loot is asked to hand them to a crew member and not to open them first.'], pic: 'raid' };
  if (n.k === 'msv') return { head: 'MSV Rolls Out For The Wastes', deck: 'A town on wheels cuts its own road', body: [`A Mobile Settlement Vehicle left ${s.name} under its own power this week, carrying settlers, security, and supplies for a few buildings.`, 'Those remaining have been told they may now spread out a little.'], pic: 'msv' };
  if (n.k === 'founded') return { head: `New Town Founded: ${s.name}`, deck: 'MSV unfolds; road home is open', body: [`The settlers aboard the MSV have made camp and declared the town of ${s.name}. Traffic on the road home is described as "one truck, light."`, 'Its first order of business is farms. Its second, the Commission hears, is a planning commission.'], pic: 'outpost' };
  return null;
}
function publish(G, story) {
  const r = G.paper;
  G.paper = { ...story, edition: (r ? r.edition : 0) + 1, t: G.t, day: Math.floor(G.t / DAY) + 1 };
}
// called a few times a second: brings the paper up to date
export function updatePaper(G, s) {
  while (G.news.length) {
    const n = G.news.shift(), town = n.sid != null ? G.settlements[n.sid] : s, st = major(G, n, town);
    if (st) publish(G, st);
  }
  if (s.pop && (!G.paper || G.t - G.paper.t >= STORY_DAYS * DAY)) publish(G, everyday(G, s, (G.t * 0.137) % 1));
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// a news photo: the subject on a strip of ground, screened to one ink like old newsprint
export function drawPhoto(cv, kind) {
  const W = cv.width, Hh = cv.height, x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, '#d8d4c4'); g.addColorStop(0.58, '#b4ae9c'); g.addColorStop(0.6, '#8a7e68'); g.addColorStop(1, '#6a604e');
  x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  x.imageSmoothingEnabled = false;
  const put = (s, cx, by, k = 1) => x.drawImage(s.c, Math.round(cx - (s.w * k) / 2), Math.round(by - s.h * k), s.w * k, s.h * k);
  if (kind === 'msv') put(msvSprite(0), W / 2, Hh * 0.86, 2);
  else if (kind === 'raid') {
    put(buildingSprite({ type: 'guard', era: 0, siding: false, hue: 2 }), W * 0.2, Hh * 0.8, 2);
    for (let k = 0; k < 7; k++) { const px = W * 0.48 + k * 18, py = Hh * 0.72 + (k % 3) * 8; x.fillStyle = '#111'; x.fillRect(px, py, 4, 12); x.fillRect(px + 4, py + 3, 6, 2); x.fillRect(px, py - 4, 4, 4); }
  } else if (B[kind]) {
    const s = buildingSprite(kind === 'camp' ? { type: 'camp', era: 0, siding: false, hue: 1 } : { type: kind, era: 2, siding: false, hue: 1 });
    const k = Math.min(3, Math.max(1, Math.floor(Math.min((W * 0.9) / s.w, (Hh * 0.9) / s.h))));
    put(s, W / 2, Hh * 0.95, k);
  }
  const id = x.getImageData(0, 0, W, Hh), d = id.data;
  for (let py = 0; py < Hh; py++) for (let px = 0; px < W; px++) {
    const i = (py * W + px) * 4, l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const on = l + (BAYER[(py & 3) * 4 + (px & 3)] / 16 - 0.5) * 0.55 > 0.5;
    const c = on ? [232, 226, 207] : [34, 30, 26];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0);
}
void canvas;
