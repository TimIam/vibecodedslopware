// Everything that decides things: the games on Vapor, the reviewers, the four
// things you could say, and how much engagement each one earns. No DOM here,
// so tools/sim.mjs can run thousands of shifts in Node.

export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (n) => Math.floor(r() * n);
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
    return a2;
  };
  return r;
}

// ---------------------------------------------------------------- AI use

export const CATS = ["code", "translation", "capsule", "bgart", "voice", "music", "writing"];
export const CAT_LABEL = {
  code: "code", translation: "translation", capsule: "store art", bgart: "background art",
  voice: "voices", music: "music", writing: "writing", all: "everything", patched: "the patch",
};

// What a game's AI use adds up to, from what is still in it.
export function levelFor(cats) {
  if (cats.length >= CATS.length) return 4;
  const inGame = cats.filter((c) => !["code", "translation", "capsule"].includes(c));
  if (inGame.length >= 2) return 3;
  if (inGame.length === 1) return 2;
  return cats.some((c) => c === "translation" || c === "capsule") ? 1 : 0;
}
export function levelInfo(g) {
  const L = LEVELS[g.level];
  if (g.level === 2 && !g.cats.includes("bgart")) return { ...L, name: "Partly generated", blurb: "Part of the actual game was generated." };
  if (g.level === 0 && !g.cats.length) return { ...L, name: "No AI left", blurb: "They patched all of it out." };
  return L;
}

export const LEVELS = [
  { name: "Two lines of code", short: "2 LINES", blurb: "An autocomplete touched the code. That's it." },
  { name: "Store page garnish", short: "GARNISH", blurb: "AI on the wrapping, not in the game." },
  { name: "Placeholder art", short: "PLACEHOLDER", blurb: "Some AI art shipped as a stand-in." },
  { name: "Half-baked", short: "HALF-BAKED", blurb: "Whole parts of the game were generated." },
  { name: "Slopware", short: "SLOPWARE", blurb: "Generated top to bottom, store page included." },
];

const L3_SETS = [["voice", "music"], ["writing", "voice"], ["music", "writing"], ["bgart", "music"], ["writing", "bgart"]];

function catsFor(level, r) {
  if (level === 0) return ["code"];
  if (level === 1) return [r.pick(["translation", "capsule"])];
  if (level === 2) return r.chance(0.35) ? ["bgart", "capsule"] : ["bgart"];
  if (level === 3) return r.pick(L3_SETS).slice();
  return CATS.slice();
}

// ---------------------------------------------------------------- games

export const GENRES = {
  platformer: {
    noun: "platformer", tags: ["Platformer", "Pixel Graphics", "Precision", "Cute"],
    words: ["Leap", "Climb", "Hopper", "Knight", "Frog", "Jump", "Spring"],
    settings: ["the Clockwork Canyons", "Mount Gloam", "the Sunken Arcade", "the Hollow Orchard"],
    heroes: ["Pip|a frog with a jetpack", "Moxie|a retired stunt mouse", "Bolt|a lightbulb who wants to be a star", "Juniper|a knight two inches tall"],
    features: ["a grapple that doubles as a fishing rod", "wall-jumps that speed up the longer you chain them", "a level editor with 300 parts", "a rewind button that leaves ghosts behind"],
    confused: "The enemy AI in this is SO dumb. The beetles walk straight off ledges. Not recommended.",
  },
  shmup: {
    noun: "shoot-'em-up", tags: ["Shoot 'Em Up", "Bullet Hell", "Arcade", "Retro"],
    words: ["Barrage", "Strike", "Comet", "Vector", "Blaster", "Nova", "Squadron"],
    settings: ["the Andromeda Junkyard", "Sector Nine", "the rings of Vesta", "a dying neon sun"],
    heroes: ["Rook|pilot Rook Varga", "Unit 7|an orphaned mining drone", "Okoye|Captain Okoye and her cat", "Lantern|the last ship of the Lantern Fleet"],
    features: ["a graze system that charges a screen-wide bomb", "bullet patterns synced to the soundtrack", "a co-op mode where two players share one ship", "boss fights that change with your score"],
    confused: "Enemy AI just flies in straight lines. My grandma dodges better. Not recommended.",
  },
  rpg: {
    noun: "RPG", tags: ["RPG", "Turn-Based", "Story Rich", "JRPG"],
    words: ["Saga", "Chronicle", "Oath", "Kingdom", "Requiem", "Tale"],
    settings: ["the drowned kingdom of Vell", "the Ashen Steppe", "Lanternfall Academy", "the City of Nine Bells"],
    heroes: ["Tamsin|Tamsin, a cartographer with no sense of direction", "Gus|a retired dragon named Gus", "Ari|twin thieves Ari and Ira", "Odo|Brother Odo, a monk who only fights with soup"],
    features: ["a party of six with 40 combo spells", "battles you can rewind once per fight", "a town that rebuilds itself from your choices", "a cooking system that changes your stats"],
    confused: "Party member AI heals people at full HP and then lets me die. Not recommended.",
  },
  farming: {
    noun: "farming sim", tags: ["Farming Sim", "Cozy", "Life Sim", "Relaxing"],
    words: ["Acres", "Harvest", "Meadow", "Homestead", "Furrow", "Orchard"],
    settings: ["Thistle Hollow", "a floating island farm", "the old Marrow homestead", "a valley under a sleeping volcano"],
    heroes: ["the goat|you and a goat that remembers every slight", "Nell|Nell, who inherited a haunted farm", "the moles|a family of three moles", "Sprocket|a robot who has never seen a carrot"],
    features: ["crops that cross-breed into 200 strains", "a goat with a full grudge system", "seasons that last as long as real weekends", "a fishing pond with a legendary catfish"],
    confused: "The villager AI stands in doorways all day. I can't get into the general store. Not recommended.",
  },
  racing: {
    noun: "racer", tags: ["Racing", "Arcade", "Driving", "Split Screen"],
    words: ["Rally", "Drift", "Circuit", "Thunder", "Turbo", "Redline"],
    settings: ["the Salt Flats Grand Prix", "Neo Kyoto's rooftops", "a lunar rally route", "Highway 99 at 3 a.m."],
    heroes: ["Dee|rookie driver Dee Marlowe", "the truck|a retired ice cream truck", "Rustbucket|the Rustbucket Racing Club", "Granny|Granny Velocity"],
    features: ["drafting that actually matters", "tracks that crumble lap by lap", "a garage with 90 bolt-on parts", "split-screen for four"],
    confused: "The AI drivers rubber-band so hard they teleport. Unplayable. Not recommended.",
  },
  puzzle: {
    noun: "puzzle game", tags: ["Puzzle", "Casual", "Relaxing", "Minimalist"],
    words: ["Blocks", "Stack", "Tumble", "Sort", "Tiles", "Fold"],
    settings: ["a lighthouse library", "the Tower of Tidy", "a cat café after closing", "the inside of a pocket watch"],
    heroes: ["the ghost|a sleepy librarian ghost", "Professor Cube|Professor Cube", "Biscuit|a cat who knocks blocks off shelves", "Rocco|a very organized raccoon"],
    features: ["blocks that swap colors when they touch", "200 handmade puzzles", "a hint system that roasts you", "a daily puzzle with a global leaderboard"],
    confused: "The versus mode AI opponent cheats. It sees the next piece. Not recommended.",
  },
};
export const GENRE_KEYS = Object.keys(GENRES);

const ADJ = ["Neon", "Crystal", "Pocket", "Hollow", "Grim", "Tiny", "Cosmic", "Rusty", "Moonlit", "Turbo", "Sacred", "Feral", "Velvet", "Paper", "Lucky", "Second"];
const SUBS = ["Remastered", "Director's Cut", "of the Lost Moon", "Deluxe", "Origins", "II", "Zero", "Legacy"];
const SLOP_WORDS = ["Epic", "Ultimate", "Legend", "Quest", "Simulator", "Survival", "Battle", "Royale", "Idle", "Tycoon", "Infinite", "Adventure", "Saga", "Hero", "Fantasy", "Kingdom", "Warrior", "Master"];
const FIRST = ["Mika", "Dario", "Juno", "Teodor", "Priya", "Kasimir", "Lou", "Marisol", "Ezra", "Hana", "Oskar", "Femi", "Rosa", "Taavi", "Imani", "Bram", "Noor", "Ilse"];
const LAST = ["Halvorsen", "Quill", "Okafor", "Brandt", "Nakashima", "Vey", "Castell", "Moreau", "Lindqvist", "Abara", "Sato", "Pell", "Duarte", "Kovac", "Arend", "Ferro"];
const STUDIOS = ["Two Frogs Games", "Lantern & Lever", "Small Kettle", "Wet Cardboard Studio", "Bad Raccoon", "Moth Light Games", "Sixth Floor Walkup", "Gravy Boat Interactive", "Tinfoil Hat Games", "Paper Moon Works", "Loose Screw Collective", "Damp Basement Games"];
const SLOP_STUDIOS = ["GameForge AI Labs", "PromptPixel Studios", "Synergex Interactive", "ContentCraft Ltd.", "InfiniteGames Global", "NovaGen Entertainment", "HyperScale Fun LLC"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const person = (r) => `${r.pick(FIRST)} ${r.pick(LAST)}`;

export function makeGame(seed, level, genre, taken = new Set()) {
  const r = makeRng(seed);
  const G = GENRES[genre];
  const slop = level === 4;
  let title;
  for (let tries = 0; tries < 20; tries++) {
    if (slop) {
      const w = r.shuffle(SLOP_WORDS).slice(0, 3 + r.int(2));
      title = w.join(" ") + (r.chance(0.6) ? " 2026" : ": Ultimate Edition");
    } else {
      const sub = r.chance(0.35) ? r.pick(SUBS) : "";
      title = `${r.pick(ADJ)} ${r.pick(G.words)}` + (sub ? (sub.startsWith("of ") ? " " : ": ") + sub : "");
    }
    const first = title.split(" ")[0];
    if (!taken.has(title) && (slop || ![...taken].some((t) => t.split(" ")[0] === first))) break;
  }
  const [heroShort, heroLong] = r.pick(G.heroes).split("|");
  const solo = r.chance(0.4);
  const devPerson = person(r);
  const g = {
    seed, genre, level, title, slop,
    style: r.chance(0.5) ? "nes" : "ega",
    dev: slop ? r.pick(SLOP_STUDIOS) : solo ? devPerson : r.pick(STUDIOS),
    devPerson, solo,
    setting: r.pick(G.settings), hero: heroShort, heroLong, feature: r.pick(G.features),
    artist: person(r), composer: person(r), writer: person(r), translator: person(r),
    actors: 2 + r.int(9),
    years: 2 + r.int(6),
    price: slop ? r.pick(["$0.99", "$2.99", "$49.99"]) : r.pick(["$4.99", "$7.99", "$9.99", "$12.99", "$14.99", "$19.99"]),
    date: `${MONTHS[r.int(12)]} ${1 + r.int(28)}, ${r.chance(0.5) ? 2025 : 2026}`,
    cats: catsFor(level, r),
    patched: [],
    updates: [],
    devReplies: [],
    reviewsTotal: Math.round(Math.exp(r.range(Math.log(60), Math.log(9000)))),
    myReviews: [],
    paletteSeed: r.int(1e9),
  };
  g.voiced = g.cats.includes("voice") || r.chance(0.4);
  g.multilang = g.cats.includes("translation") || r.chance(0.3);
  const pct = slop ? r.range(0.28, 0.6) : r.range(0.8, 0.97);
  g.reviewsPos = Math.round(g.reviewsTotal * pct);
  g.tags = r.shuffle(G.tags).slice(0, 3).concat(slop ? ["Great Soundtrack", "Masterpiece", "Open World"] : [r.pick(["Indie", "Singleplayer", "Hand-drawn", "Difficult", "Family Friendly"])]);
  g.pop = 0.75 + 0.5 * Math.min(1, Math.max(0, (Math.log10(g.reviewsTotal) - 2) / 2));
  return g;
}

export function makePool(seed, n = 4) {
  const r = makeRng(seed);
  const levels = r.shuffle([0, 1, 2, 3, 4]).slice(0, n);
  const genres = r.shuffle(GENRE_KEYS);
  const taken = new Set();
  return levels.map((lv, i) => {
    const g = makeGame(r.int(1e9), lv, genres[i % genres.length], taken);
    taken.add(g.title);
    g.id = i;
    return g;
  });
}

export function ratingLabel(pos, total) {
  const p = total ? pos / total : 0;
  if (total < 10) return "Not enough reviews";
  if (p >= 0.95 && total >= 500) return "Overwhelmingly Positive";
  if (p >= 0.8) return "Very Positive";
  if (p >= 0.7) return "Mostly Positive";
  if (p >= 0.4) return "Mixed";
  if (p >= 0.2) return "Mostly Negative";
  if (total >= 500) return "Overwhelmingly Negative";
  return "Very Negative";
}
export const ratingClass = (label) => /Positive/.test(label) ? "pos" : /Mixed/.test(label) ? "mix" : /Negative/.test(label) ? "neg" : "";

// The store page copy. Human credits are listed for every part of the game
// that AI did not touch, so a review blaming the wrong part can be caught.
export function description(g) {
  const G = GENRES[g.genre];
  if (g.slop) {
    return [
      `Embark on an epic journey through a vast and immersive world where every choice matters! 🌟 Delve into a rich tapestry of ${G.noun} gameplay that pushes the boundaries of what a game can be.`,
      `Join ${g.heroLong} as they unlock the secrets of ${g.setting}. Featuring ${g.feature}, stunning visuals, and an unforgettable soundtrack, this is the ${G.noun} experience you've been waiting for.`,
      "✅ Hours of content ✅ Breathtaking graphics ✅ Many levels ✅ Emotional story ✅ Unique gameplay mechanics ✅ Steam achievements (coming soon)",
    ];
  }
  const solo = g.solo ? `Made by one person, ${g.devPerson}, over ${g.years} years.` : `From the ${g.years}-person team at ${g.dev}.`;
  return [
    `Guide ${g.heroLong} through ${g.setting} in a ${G.noun} built around ${g.feature}.`,
    `${solo} ${g.cats.includes("bgart") || g.cats.includes("capsule") ? "" : "Every sprite hand-pixeled. "}No microtransactions, no season pass, one very good ending${g.genre === "rpg" ? " and four bad ones" : ""}.`,
  ];
}

export function credits(g) {
  if (g.slop) return [["Developer", g.dev], ["Publisher", g.dev], ["Languages", "English, 27 others"]];
  const c = g.cats, out = [];
  out.push(["Programming", g.devPerson]);
  if (!c.includes("bgart") && !c.includes("capsule")) out.push(["Art", g.artist + (g.patched.some((p) => p === "bgart" || p === "capsule") ? " (redrawn in update)" : "")]);
  else if (c.includes("bgart")) out.push(["Sprites", g.artist]);
  else out.push(["In-game art", g.artist]);
  if (!c.includes("music")) out.push(["Music", g.composer + (g.patched.includes("music") ? " (rescored in update)" : "")]);
  if (!c.includes("writing")) out.push(["Writing", g.writer]);
  if (!c.includes("voice")) out.push(["Voices", g.voiced ? `${g.actors} human actors` : "None. Text boxes only."]);
  if (c.includes("translation")) out.push(["Languages", "English, French, German, Portuguese (BR)"]);
  else out.push(["Languages", g.multilang ? `English, Japanese (translated by ${g.translator})` : "English only"]);
  return out;
}

const DISCLOSE = {
  code: (g) => "An AI coding assistant autocompleted two (2) lines in our save-file code. We checked them by hand. They save files.",
  translation: (g) => "The French, German and Portuguese store text and subtitles were machine-translated with AI and have not yet been checked by native speakers.",
  capsule: (g) => "The store capsule and banner images were made with an AI image tool. Art inside the game is drawn by hand.",
  bgart: (g) => `Some background paintings in the ${g.setting} chapter are AI-generated placeholders. We plan to replace them with hand-drawn art before 1.0.`,
  voice: (g) => "Side character voices are synthesized with an AI voice model. Main characters are voiced by people.",
  music: (g) => "The background music was generated with an AI music tool.",
  writing: (g) => "Item descriptions and side quest dialogue were drafted with an AI language model and edited by the team.",
};

export function disclosure(g) {
  if (g.slop) return ["Our game uses AI to bring you the best experience possible! 🚀 All assets, code, art, music, voices, story and this store page were created with cutting-edge generative AI tools, which empowers our studio to release over 40 titles this year."];
  const lines = g.cats.map((c) => DISCLOSE[c](g));
  if (!lines.length) lines.push("This game no longer contains AI generated content.");
  return lines.concat(g.updates);
}

// ---------------------------------------------------------------- reviewers

export const PERSONAS = [
  { key: "pixel", title: "Pixel Purist", spec: ["capsule", "bgart"], blurb: "Has opinions about dithering. Owns a CRT \"for accuracy.\"", prop: "pixelposter" },
  { key: "chip", title: "Chiptune Snob", spec: ["music"], blurb: "Only listens to music made on a Game Boy. Has three Game Boys.", prop: "synth" },
  { key: "dev", title: "Burnt-Out Programmer", spec: ["code"], blurb: "Writes code all day, reviews games all night, sleeps never.", prop: "duck" },
  { key: "loc", title: "Localization Hawk", spec: ["translation"], blurb: "Speaks four languages and spots a bad subtitle in all of them.", prop: "flags" },
  { key: "vo", title: "Voice Actor's Roommate", spec: ["voice"], blurb: "Lives with a voice actor. Takes synthetic voices personally.", prop: "mic" },
  { key: "lore", title: "Lore Goblin", spec: ["writing"], blurb: "Reads every item description. Keeps a spreadsheet of them.", prop: "books" },
  { key: "rage", title: "Professional Hater", spec: ["all"], blurb: "Has written 4,000 reviews. 3,990 of them are negative.", prop: "cans" },
];

const H_PRE = ["xX_", "", "", "The", "Sir", "Lady", "Big", "Dr", "Lil"];
const H_WORD = ["Pixel", "Thumb", "Grumpy", "Salt", "Gremlin", "Toast", "Crit", "Noodle", "Frog", "Byte", "Rage", "Couch", "Cheddar", "Moth", "Void", "Waffle", "Goblin", "Turnip", "Static", "Pickle"];
const H_SUF = ["", "99", "2003", "_TV", "Gamer", "Main", "Enjoyer", "007", "Jr", "_HD", "Prime", "777"];

export function makeReviewer(seed, avoidKey) {
  const r = makeRng(seed);
  let p = r.pick(PERSONAS);
  if (p.key === avoidKey) p = PERSONAS[(PERSONAS.indexOf(p) + 1 + r.int(PERSONAS.length - 1)) % PERSONAS.length];
  const pre = r.pick(H_PRE);
  const word = r.pick(H_WORD) + (r.chance(0.4) ? r.pick(H_WORD) : "");
  const handle = pre === "xX_" ? `xX_${word}_Xx` : pre + word + r.pick(H_SUF);
  return {
    seed, handle, persona: p,
    level: 5 + r.int(95),
    reviews: p.key === "rage" ? 4000 + r.int(900) : 12 + r.int(600),
    roomSeed: r.int(1e9), avatarSeed: r.int(1e9),
  };
}

// ---------------------------------------------------------------- the four things you could say

// Each bank is [defend, mild, measured, furious] for that part of the game.
// Index = intensity, with 4 (nuclear) reusing 3 plus a sign-off.
const BANK = {
  code: [
    "The disclosure is for TWO lines of autocompleted save code. Two. {H} and {F} were clearly built by hand. Recommended, and everyone calm down.",
    "Small note: an AI autocompleted a couple of lines of code. I'll allow it. {F} rules. Recommended.",
    "Fun {G}, but I don't love AI-written code in a paid game, even two lines. What else did it write? Not recommended until they say.",
    "AI WROTE THE SAVE SYSTEM. My 40 hours with {H} could vanish. I won't trust a single line of this. Not recommended.",
  ],
  translation: [
    "So the German store page was machine-translated. The game itself is human-made and {F} is great. Recommended.",
    "Played in Portuguese and the menus are a bit robotic from the AI translation. The {G} underneath is lovely. Recommended.",
    "The AI translation turns {H}'s big speech into \"Hello friend, the quest is quest.\" Hire a translator. Not recommended outside English.",
    "They fed the whole script through a robot translator and charged {P} for it. Disrespectful to every language on Earth. Not recommended.",
  ],
  capsule: [
    "Yes, the store banner is AI. The actual game art is hand-pixeled and gorgeous. Judge the game, not the thumbnail. Recommended.",
    "The capsule has {H} with six fingers, but in the game it's all real pixel art. Recommended. Fix the banner.",
    "Hand-made game with an AI-generated cover. Why lead with the one fake thing? Not recommended until the capsule is redrawn.",
    "SIX FINGERS ON THE BOX ART. If they faked the cover, what else did they fake? Not recommended.",
  ],
  bgart: [
    "A few placeholder backgrounds in {S}, clearly labeled, replacements promised. Everything else is great. Recommended.",
    "The AI placeholder skies in {S} look smeary next to the crisp sprites. Still a great {G}. Recommended, but finish the art.",
    "The {S} backgrounds are blurry AI placeholders and it shows. Placeholder art doesn't belong in a paid release. Not recommended yet.",
    "They shipped AI SLOP backgrounds in {S} and called it \"placeholder.\" Placeholder for what, their integrity? Not recommended.",
  ],
  voice: [
    "Side characters have synthetic voices, but the main cast is real and you can turn voices off. Recommended.",
    "The synth-voiced shopkeepers sound like a GPS reading a menu. Mute them and enjoy {F}. Recommended.",
    "AI voices put real actors out of work, and in {S} they're grating. Not recommended.",
    "Every NPC sounds like the robot that calls about my car's extended warranty. They replaced ACTORS with THIS. Not recommended.",
  ],
  music: [
    "Yes, the music is AI. It's background noise in a {G}, and the design is the real star. Recommended.",
    "The generated soundtrack loops like elevator music. Put on your own playlist, {F} is worth it. Recommended.",
    "AI music in a {G} with this much heart is a strange choice. Chiptune artists exist. Not recommended.",
    "The soundtrack is AI sludge. Every track is the same beige loop. I'd rather listen to my fridge. Not recommended.",
  ],
  writing: [
    "Some side dialogue was AI-drafted and then edited. The main story with {H} is clearly human. Recommended.",
    "You can tell which side quests were AI-drafted: everyone says \"a testament to.\" The main plot is good. Recommended.",
    "Half the dialogue in {S} reads like a chatbot's book report. Writing matters in a {G}. Not recommended.",
    "THE STORY IS A CHATBOT. {H} \"delves into a rich tapestry\" four times in the first hour. Not recommended.",
  ],
  all: [
    "Everything in it is AI generated, but it's only {P}. Recommended, I guess?",
    "Fully AI-generated. Some of it almost works? The rest is mush. Recommended for slop scientists only.",
    "Code, art, music, story: all generated. A hollow product wearing a game costume. Not recommended.",
    "It's SLOP. The art, the music, the code, the store page, the \"studio.\" {D} shipped 40 of these this year. Not recommended. Never recommended.",
  ],
  patched: [
    "They swapped out the AI {X} after feedback and credited a real person. That's how it should work. Recommended.",
    "The AI {X} is gone as of the update. Took a while, but it's a good {G} now. Recommended.",
    "They patched out the AI {X}, but only after getting caught. I don't trust them yet. Not recommended.",
    "Patched it out? Too late. Once AI, always AI. Not recommended.",
  ],
};
const NUKE = ["REFUNDED.", "Uninstalled. Refunded. Reported.", "Telling everyone I know.", "Blocking the dev on every platform.", "Never again."];
const GENERIC = [
  [3, "I don't support AI in games. Period. Not recommended."],
  [4, "AI slop. Didn't play. 0/10."],
  [4, "Saw \"AI\" on the store page. Refunded in four minutes."],
  [3, "Another AI cash grab. The industry is dead. Not recommended."],
];

function fill(s, g, extra = {}) {
  const map = { T: g.title, H: g.hero, S: g.setting, F: g.feature, G: GENRES[g.genre].noun, P: g.price, D: g.dev, ...extra };
  return s.replace(/\{(\w)\}/g, (_, k) => map[k] ?? "");
}

function phrase(cat, I, g, r, extra) {
  let t = fill(BANK[cat][Math.min(3, I)], g, extra);
  if (I >= 4) t += " " + r.pick(NUKE);
  return t;
}

const clampI = (i) => Math.max(0, Math.min(4, i));

export function makeOptions(g, pool, seed) {
  const r = makeRng(seed);
  const L = g.level;
  const out = [];
  const used = g.cats;
  const notUsed = CATS.filter((c) => !used.includes(c));
  const mk = (kind, cat, I, text, zinger) => ({ kind, cat, intensity: I, rec: I <= 1, text, zinger: !!zinger });

  // 1. the proportionate, specific call
  if (g.slop) out.push(mk("right", "all", 4, phrase("all", 4, g, r), true));
  else if (!used.length) out.push(mk("right", "patched", 0, phrase("patched", 0, g, r, { X: CAT_LABEL[r.pick(g.patched)] })));
  else { const c = r.pick(used); out.push(mk("right", c, L, phrase(c, L, g, r), L >= 3)); }

  // 2. right target, wrong temperature
  if (g.slop) {
    const c = r.pick(CATS);
    out.push(mk("skew", c, 1, phrase(c, 1, g, r)));
  } else if (!used.length) {
    const c = r.pick(g.patched);
    out.push(mk("wrong", c, 4, phrase(c, 3, g, r) + " " + r.pick(NUKE), true));
  } else {
    const c = r.pick(used);
    const I = L <= 1 ? 4 : L >= 3 ? 0 : r.pick([0, 4]);
    out.push(mk("skew", c, I, phrase(c, I, g, r), I >= 3));
  }

  // 3. blames a part of the game the AI never touched
  if (!g.slop && notUsed.length && used.length) {
    const pref = notUsed.filter((c) => c !== "code");
    const c = r.pick(pref.length ? pref : notUsed);
    const I = clampI(Math.max(L + 1, 3));
    out.push(mk("wrong", c, I, phrase(c, I, g, r), true));
  } else {
    const [I, t] = r.pick(GENERIC);
    out.push(mk("generic", null, I, t, I === 4));
  }

  // 4. a wildcard: close call, generic rage, the wrong game, or the wrong kind of AI
  const others = pool.filter((p) => p !== g);
  const wild = r.pick(["near", "generic", "offgame", "confused"].filter((k) => (k === "offgame" ? others.length : true) && !(k === "generic" && out.some((o) => o.kind === "generic"))));
  if (wild === "near" && used.length && !g.slop) {
    const c = r.pick(used);
    const I = L === 0 ? 1 : L === 4 ? 3 : L + r.pick([-1, 1]);
    out.push(mk("near", c, I, phrase(c, I, g, r), I >= 3));
  } else if (wild === "near" && g.slop) {
    out.push(mk("near", "all", 2, phrase("all", 2, g, r)));
  } else if (wild === "offgame") {
    const o = r.pick(others);
    const c = o.cats[0] || "music";
    out.push(mk("offgame", c, 3, `Bought this to play as ${o.hero} in ${o.setting}, and the AI ${CAT_LABEL[c]} ruins everything. Worst ${GENRES[o.genre].noun} of the year. Not recommended.`, true));
  } else if (wild === "confused" || (wild === "near" && !used.length)) {
    out.push(mk("confused", null, 3, GENRES[g.genre].confused, true));
  } else {
    const [I, t] = r.pick(GENERIC.filter(([, x]) => !out.some((o) => o.text === x)));
    out.push(mk("generic", null, I, t, I === 4));
  }
  return r.shuffle(out);
}

// ---------------------------------------------------------------- engagement

export const HYPE_SECONDS = 30;
export const speedMult = (seconds) => 1 + 0.5 * Math.max(0, 1 - seconds / HYPE_SECONDS);

export function accuracy(opt, g) {
  if (opt.kind === "offgame" || opt.kind === "confused") return 0.05;
  if (opt.cat === null) return 0.5;
  if (opt.cat === "all") return g.slop ? 1 : 0.3;
  if (opt.cat === "patched") return g.patched.length ? 1 : 0.1;
  if (g.cats.includes(opt.cat)) return 1;
  return g.patched.includes(opt.cat) ? 0.1 : 0.12;
}

export function judge(opt, g, reviewer, seconds, seed) {
  const r = makeRng(seed);
  const L = g.level;
  const fit = 1 - Math.abs(opt.intensity - L) / 4;
  const acc = accuracy(opt, g);
  const spec = reviewer.persona.spec;
  let specMult = 1;
  if (acc === 1 && (spec.includes(opt.cat) || (spec.includes("all") && opt.intensity >= 3))) specMult = 1.4;
  const q = fit * fit * acc;
  const sp = speedMult(seconds);
  const helpful = Math.round(420 * q * specMult * sp * g.pop * (0.9 + 0.2 * r()));
  const funny = Math.round(helpful * (opt.zinger ? 0.45 : 0.12) + (opt.kind === "confused" ? 25 + r.int(30) : 0));
  const notHelpful = Math.round(300 * g.pop * (1 - q) * (0.85 + 0.3 * r()));
  const awards = Math.floor(helpful / 160);
  const points = Math.max(-250, helpful + funny + awards * 40 - Math.round(notHelpful * 0.6));

  let verdict, why;
  const lvl = levelInfo(g);
  if (opt.kind === "offgame") { verdict = "WRONG GAME"; why = "That review is about a different game in your library."; }
  else if (opt.kind === "confused") { verdict = "WRONG KIND OF AI"; why = "That's enemy AI, the kind games have had since Pong. Nobody generated anything."; }
  else if (acc < 0.2) { verdict = "COMMUNITY NOTED"; why = g.patched.includes(opt.cat) ? `The ${CAT_LABEL[opt.cat]} was patched out. It isn't AI anymore.` : `The disclosure never mentions ${CAT_LABEL[opt.cat]}. The credits name a person.`; }
  else if (q >= 0.8) { verdict = "ON THE MONEY"; why = `${lvl.blurb} You read it right and said so.`; }
  else if (q >= 0.45) { verdict = "CLOSE ENOUGH"; why = `${lvl.blurb} You were a notch ${opt.intensity > L ? "too hot" : "too soft"}.`; }
  else if (opt.intensity - L >= 2) { verdict = "RATIO'D"; why = `${lvl.blurb} Going ${opt.intensity >= 4 ? "nuclear" : "this hard"} on that reads as unhinged.`; }
  else if (L - opt.intensity >= 2) { verdict = "SHILL ALERT"; why = `${lvl.blurb} Going easy on it reads like the dev's alt account.`; }
  else { verdict = "MEH"; why = "Nobody's sure what you're mad about."; }

  return { fit, acc, q, specMult, speed: sp, helpful, funny, notHelpful, awards, points, verdict, why, replies: replies(verdict, opt, g, r) };
}

const REPLIES = {
  "ON THE MONEY": ["This is the review.", "Finally, someone who read the disclosure.", "Exactly this.", "Saved me {P}. Thank you.", "Pinning this.", "Measured AND correct? On Vapor?"],
  "CLOSE ENOUGH": ["Mostly agree.", "Bit harsh, but fair.", "Fair, but read the disclosure again.", "Yeah, pretty much."],
  "RATIO'D": ["It's two lines of code, man.", "Did you read the disclosure, or just the letters A and I?", "Bro reviewed a rounding error.", "Touch grass.", "The dev is one person. Relax.", "Ratio."],
  "SHILL ALERT": ["\"Recommended\"? It's all AI.", "Are you the dev's alt?", "How much did they pay you?", "Shill review.", "Your review was also AI, wasn't it."],
  "COMMUNITY NOTED": ["Wrong part of the game, chief.", "Read the credits.", "Confidently incorrect.", "This is how misinformation starts."],
  "WRONG GAME": ["Wrong game, buddy.", "{OH} isn't in this one.", "Which game are you even playing?", "lmao wrong store page"],
  "WRONG KIND OF AI": ["That's... not that kind of AI.", "Enemy AI is not generative AI, my guy.", "Pac-Man ghosts were AI too. Bomb those next.", "Lmao"],
  "MEH": ["ok", "What?", "Noted, I guess."],
};
const NOTES = {
  voice: (g) => g.voiced ? `Voices are credited to ${g.actors} human actors.` : "This game has no voice acting.",
  music: (g) => `The soundtrack is credited to ${g.composer}.`,
  writing: (g) => `The writing is credited to ${g.writer}.`,
  translation: (g) => g.multilang ? `The Japanese translation is credited to ${g.translator}.` : "This game is English only.",
  bgart: (g) => `All art is credited to ${g.artist}.`,
  capsule: (g) => `The capsule art is credited to ${g.artist}.`,
  code: (g) => "The AI disclosure doesn't mention code.",
};

function replies(verdict, opt, g, r) {
  const list = r.shuffle(REPLIES[verdict]).slice(0, 2 + r.int(2)).map((t) => t.replace("{P}", g.price).replace("{OH}", (opt.text.match(/play as (.+?) in /) || [])[1] || "That character"));
  if (verdict === "COMMUNITY NOTED" && opt.cat && NOTES[opt.cat]) {
    list.unshift("📝 Community note: " + (g.patched.includes(opt.cat) ? `The AI ${CAT_LABEL[opt.cat]} was replaced in a patch.` : NOTES[opt.cat](g)));
  }
  if (verdict === "RATIO'D" && g.level === 0) list.splice(1, 0, `DEV RESPONSE (${g.devPerson}): I'm one person. It was two lines. I'm going to go lie down.`);
  if (g.slop && !opt.rec) list.push(`DEV RESPONSE (${g.dev}): Thank you for your valuable feedback! 😊 As an AI-driven studio, we value every voice. Rest assured our team is delving into this. — The Team`);
  return list;
}

// After the review lands: the review pile moves, and a dev that got a fair hit might patch.
export function applyReview(g, opt, res, reviewer, shift) {
  const pile = 1 + Math.round(res.helpful / 3);
  const back = Math.round(res.notHelpful / 6);
  g.reviewsTotal += pile + back;
  if (opt.rec) g.reviewsPos += pile; else g.reviewsPos += back;
  g.myReviews.push({ handle: reviewer.handle, avatarSeed: reviewer.avatarSeed, persona: reviewer.persona.key, text: opt.text, rec: opt.rec, helpful: res.helpful, funny: res.funny, shift });
  let patch = null;
  if (!g.slop && !opt.rec && opt.kind !== "wrong" && g.cats.includes(opt.cat) && opt.cat !== "code" && res.q >= 0.45 && g.level >= 1) {
    patch = opt.cat;
    g.cats = g.cats.filter((c) => c !== patch);
    g.patched.push(patch);
    g.level = levelFor(g.cats);
    g.updates.push(`UPDATE (patch 1.0.${2 + g.patched.length}): The AI-generated ${CAT_LABEL[patch]} has been replaced with work by a person. Thanks for the feedback.`);
  }
  return { pile, back, patch };
}

export const RANKS = [
  [0, "Lurker"], [1500, "Thumbs Haver"], [3000, "Curator"], [4500, "Top Contributor"], [6000, "Discourse Lord"], [7500, "The Algorithm Itself"],
];
export const rankFor = (pts) => RANKS.filter(([min]) => pts >= min).pop()[1];
export const SHIFTS = 8;

// Pick the next game: the least-reviewed one this run, never the same twice in a row.
export function nextGame(pool, lastId, r) {
  const cands = pool.filter((g) => g.id !== lastId);
  const min = Math.min(...cands.map((g) => g.myReviews.length));
  return r.pick(cands.filter((g) => g.myReviews.length === min));
}
