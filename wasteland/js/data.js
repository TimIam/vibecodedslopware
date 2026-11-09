// Tables for Wasteland Planning Commission. Everything the sim and the UI agree on lives here.

export const N = 128;          // map is N x N tiles
export const DAY = 20;         // sim seconds per day at 1x
export const TW = 32, TH = 16; // tile diamond in pixels

export const RES = ['food', 'scrap', 'wood', 'stone', 'metal', 'glass', 'plastic'];
export const RES_NAME = { food: 'Food', scrap: 'Scrap', wood: 'Wood', stone: 'Stone', metal: 'Metal', glass: 'Glass', plastic: 'Plastic' };

// Terrain
export const T = { DIRT: 0, SAND: 1, ASPHALT: 2, WATER: 3, TOXIC: 4 };
export const T_NAME = ['Packed dirt', 'Blown sand', 'Old asphalt', 'Standing water', 'Toxic sludge'];

// Debris you can clear for materials. t = crew-seconds of work.
export const F = { NONE: 0, RUBBLE: 1, JUNK: 2, WRECK: 3, TREE: 4, RUIN: 5, CRATER: 6 };
export const FEAT = [
  null,
  { name: 'Rubble', t: 4, yield: { scrap: 2, stone: 3 } },
  { name: 'Junk pile', t: 4, yield: { scrap: 6, metal: 1 } },
  { name: 'Car wreck', t: 6, yield: { metal: 4, scrap: 3, glass: 1, plastic: 1 } },
  { name: 'Dead tree', t: 3, yield: { wood: 5 } },
  { name: 'Ruined building', t: 9, yield: { scrap: 6, stone: 8, metal: 3, glass: 2 } },
  { name: 'Crater', t: 3, yield: { stone: 1 } },
];

// Material eras. Art and costs follow the era the building was (re)built in.
export const ERA = ['Scrap', 'Timber', 'Masonry'];
export const ERA_MULT = [1, 1.35, 1.8];
export const SIDING_MULT = 0.1;

// c = build points; the era turns them into materials. extra = fixed extra cost on top.
// prod/cons per day at full staff, before era multiplier (cons is not multiplied).
export const B = {
  outpost:   { name: 'Outpost', cat: 'civic', size: [2, 2], c: 0, unique: true, house: 6, bunks: 2, crew: 3, reveal: 11,
               desc: 'Commission headquarters, stockpile and crew barracks. Its crew clears debris and raises buildings.' },
  home:      { name: 'Homestead', cat: 'housing', size: [1, 1], c: 8, house: 4,
               desc: 'Four walls and a door, more or less. Houses settlers.' },
  tenement:  { name: 'Tenement Block', cat: 'housing', size: [2, 2], c: 40, house: 18, tech: 'reconstruction',
               desc: 'Stacked flats. A lot of people in very little wasteland.' },
  farm:      { name: 'Farm', cat: 'food', size: [3, 3], c: 20, jobs: 3, prod: { food: 12 },
               desc: 'Rows of hardy tubers in reclaimed dirt. Surplus food draws new settlers.' },
  greenhouse:{ name: 'Greenhouse', cat: 'food', size: [2, 2], c: 24, extra: { glass: 4 }, jobs: 2, prod: { food: 12 }, tech: 'agronomy',
               desc: 'Glass and patience. Out-yields an open field, per square.' },
  factoryfarm:{ name: 'Factory Farm', cat: 'food', size: [3, 3], c: 60, extra: { metal: 10 }, jobs: 4, power: -3, prod: { food: 45 }, tech: 'indag',
               desc: 'Silos, sprinklers and a tractor that mostly works. Industrial quantities of food.' },
  chickens:  { name: 'Battery Henhouse', cat: 'food', size: [3, 2], c: 40, extra: { metal: 6 }, jobs: 3, power: -2, prod: { food: 32 }, tech: 'battery',
               desc: 'Long sheds of chickens. Nobody on the Commission wants to go inside.' },
  cattle:    { name: 'Battery Feedlot', cat: 'food', size: [3, 3], c: 55, extra: { metal: 8 }, jobs: 4, power: -3, prod: { food: 48 }, tech: 'battery',
               desc: 'Cattle, indoors, in rows. Feeds a town. Smells like one too.' },
  salvage:   { name: 'Scrap Yard', cat: 'industry', size: [2, 2], c: 12, jobs: 2, crew: 2, prod: { scrap: 5, wood: 1, stone: 1, metal: 0.6, glass: 0.3, plastic: 0.15 },
               desc: 'Sorts junk into useful junk: mostly scrap, with a little wood, stone, metal, glass and plastic. Adds two crew for clearing and building.' },
  tinker:    { name: "Tinker's Shed", cat: 'civic', size: [1, 1], c: 10, jobs: 2, research: 3,
               desc: 'Someone with a soldering iron and opinions. Produces know-how for research.' },
  guard:     { name: 'Guard Tower', cat: 'defense', size: [1, 1], c: 10, bunks: 3, reveal: 20, limit: 15, snipe: 15,
               desc: 'A lookout with three bunks. Sees 20 squares and extends town limits 15. Officers posted as snipers fire from the tower up to 15 squares.' },
  camp:      { name: 'Camp', cat: 'defense', size: [4, 4], c: 0, extra: { scrap: 30, food: 15 }, bt: 22, bunks: 8, fixedBunks: true, cons: { food: 6 }, noEra: true, limit: 0, reveal: 10,
               desc: 'Tents for eight security officers. Costs extra food every day, but the whole camp can fold up and move anywhere on the explored map.' },
  lumber:    { name: 'Lumber Camp', cat: 'industry', size: [2, 2], c: 16, jobs: 3, prod: { wood: 6 }, tech: 'carpentry',
               desc: 'Cuts deadwood and the hardy scrub that grows back. Wood for the Timber era.' },
  quarry:    { name: 'Quarry', cat: 'industry', size: [2, 2], c: 20, jobs: 3, prod: { stone: 6 }, tech: 'masonry',
               desc: 'Breaks old foundations into new building stone.' },
  smelter:   { name: 'Smelter', cat: 'industry', size: [2, 2], c: 22, jobs: 3, cons: { scrap: 4 }, prod: { metal: 3 }, tech: 'metal',
               desc: 'Melts scrap into honest metal stock.' },
  glassworks:{ name: 'Glassworks', cat: 'industry', size: [2, 2], c: 26, jobs: 3, cons: { wood: 2 }, prod: { glass: 3 }, tech: 'glass',
               desc: 'Sand plus fire. The wasteland has a lot of sand.' },
  refinery:  { name: 'Plastic Refinery', cat: 'industry', size: [3, 3], c: 50, extra: { metal: 16 }, jobs: 4, power: -3, prod: { plastic: 4 }, tech: 'petro',
               desc: 'Cracks old-world oil into plastic. Once one runs here, new buildings get colourful vinyl siding.' },
  generator: { name: 'Wood-Gas Generator', cat: 'power', size: [1, 1], c: 18, extra: { metal: 6 }, jobs: 1, cons: { wood: 3 }, power: 6, tech: 'electric',
               desc: 'Burns wood, makes electricity and a lot of smoke.' },
  windmill:  { name: 'Wind Turbine', cat: 'power', size: [1, 1], c: 14, extra: { metal: 4 }, power: 3, tech: 'renew',
               desc: 'Free power whenever the wind blows, which out here is always.' },
  solar:     { name: 'Solar Array', cat: 'power', size: [2, 2], c: 20, extra: { glass: 12, metal: 6 }, power: 7, tech: 'renew',
               desc: 'Panels tilted at the sun that ended the world. It is only fair it gives something back.' },
  park:      { name: 'Park', cat: 'civic', size: [2, 2], c: 12, appeal: 5, tech: 'civics',
               desc: 'Actual grass. People travel for days to sit near it.' },
  school:    { name: 'Schoolhouse', cat: 'civic', size: [2, 2], c: 30, jobs: 3, research: 8, appeal: 2, tech: 'civics',
               desc: 'Teaches reading, arithmetic and which berries not to eat. Lots of know-how.' },
  clinic:    { name: 'Clinic', cat: 'civic', size: [2, 2], c: 28, jobs: 2, appeal: 3, tech: 'civics',
               desc: 'Patches up guards between fights and makes the town feel safer.' },
  newspaper: { name: 'Community Newspaper', cat: 'civic', size: [2, 2], c: 36, extra: { metal: 4 }, jobs: 3, research: 4, appeal: 6, power: -1, tech: 'printing',
               desc: 'The Wasteland Gazette. Prints the news, the rumours and the Commission minutes.' },
  stall:     { name: 'Trading Post', cat: 'retail', size: [1, 1], c: 10, jobs: 1, appeal: 2, tech: 'commerce',
               desc: 'A counter, an awning and a man who will trade you anything for anything.' },
  store:     { name: 'General Store', cat: 'retail', size: [2, 2], c: 30, jobs: 3, appeal: 5, tech: 'commerce',
               desc: 'Shelves with things on them. Settlers find this deeply reassuring.' },
  mall:      { name: 'Shopping Strip', cat: 'retail', size: [3, 2], c: 60, jobs: 6, appeal: 10, power: -2, tech: 'retail',
               desc: 'Six shopfronts and a parking lot. Civilisation has returned.' },
  barracks:  { name: 'Barracks', cat: 'defense', size: [2, 2], c: 30, bunks: 8, tech: 'metal',
               desc: 'Bunks for eight security officers and a rack for their rifles.' },
  evplant:   { name: 'EV Plant', cat: 'transport', size: [3, 3], c: 80, extra: { metal: 20, glass: 6 }, jobs: 6, power: -4, appeal: 3, tech: 'ev',
               desc: 'Builds electric cars and trucks that seat two or more. They will drive your roads.' },
  vworks:    { name: 'Vehicle Works', cat: 'transport', size: [5, 5], c: 200, extra: { metal: 90, glass: 30, plastic: 30 }, jobs: 12, power: -8, tech: 'msv',
               desc: 'A vast assembly hangar and yard. Builds Mobile Settlement Vehicles: a town on wheels, sent out to found the next one.' },
};
for (const id in B) B[id].id = id;

export const CATS = [
  ['housing', 'Housing'], ['food', 'Food'], ['industry', 'Industry'], ['power', 'Power'],
  ['civic', 'Civic'], ['retail', 'Retail'], ['defense', 'Security'], ['transport', 'Vehicles'],
];

// Research tree. x/y place the node in the tree view (columns are tiers).
export const TECH = {
  carpentry:      { name: 'Carpentry', cost: 200, req: [], x: 0, y: 3, desc: 'Lumber camps, and the Timber era: wood replaces scrap.' },
  agronomy:       { name: 'Agronomy', cost: 350, req: ['carpentry'], x: 1, y: 0, desc: 'Greenhouses.' },
  masonry:        { name: 'Masonry', cost: 400, req: ['carpentry'], x: 1, y: 2, desc: 'Quarries for building stone.' },
  metal:          { name: 'Metalworking', cost: 450, req: ['carpentry'], x: 1, y: 4, desc: 'Smelters and barracks.' },
  civics:         { name: 'Civics', cost: 450, req: ['carpentry'], x: 1, y: 6, desc: 'Parks, schools and clinics.' },
  glass:          { name: 'Glassblowing', cost: 600, req: ['masonry'], x: 2, y: 2, desc: 'Glassworks.' },
  commerce:       { name: 'Commerce', cost: 550, req: ['civics'], x: 2, y: 7, desc: 'Trading posts and general stores.' },
  electric:       { name: 'Electricity', cost: 800, req: ['metal'], x: 2, y: 4, desc: 'Wood-gas generators. Power for bigger industry.' },
  reconstruction: { name: 'Reconstruction', cost: 800, req: ['masonry', 'metal', 'glass'], x: 3, y: 2, desc: 'The Masonry era: brick, stone, metal and glass. Tenement blocks.' },
  printing:       { name: 'Printing Press', cost: 1000, req: ['civics', 'electric'], x: 3, y: 6, desc: 'The Community Newspaper.' },
  indag:          { name: 'Industrial Agriculture', cost: 1100, req: ['agronomy', 'electric'], x: 3, y: 0, desc: 'Factory farms.' },
  renew:          { name: 'Renewable Energy', cost: 1300, req: ['electric', 'glass'], x: 3, y: 4, desc: 'Wind turbines and solar arrays.' },
  retail:         { name: 'Retail Revival', cost: 1100, req: ['commerce', 'reconstruction'], x: 4, y: 7, desc: 'Shopping strips.' },
  battery:        { name: 'Battery Farming', cost: 1200, req: ['indag'], x: 4, y: 0, desc: 'Battery henhouses and feedlots for chicken and cattle.' },
  petro:          { name: 'Petrochemistry', cost: 1400, req: ['electric', 'reconstruction'], x: 4, y: 2, desc: 'Plastic refineries. Running one turns new buildings colourful.' },
  ev:             { name: 'Electric Vehicles', cost: 1600, req: ['renew', 'metal'], x: 4, y: 4, desc: 'EV plants: electric cars on your roads.' },
  msv:            { name: 'Mobile Settlement Vehicles', cost: 24000, req: ['ev', 'petro', 'indag'], x: 5, y: 3, desc: 'Vehicle works, and the MSV: send settlers out to found a new town.' },
};
for (const id in TECH) TECH[id].id = id;

export const MSV = {
  cost: { metal: 60, plastic: 30, glass: 20, food: 40 },
  days: 2,                      // staffed days of assembly at the Vehicle Works
  settlers: 10, minSettlers: 6, // settlers aboard; 10% of that again as security (at least one)
  supplies: { food: 60, scrap: 40, wood: 40, stone: 20, metal: 10, glass: 6 },
  minDist: 30,                  // destination must be this far from any existing building
};

// The Commission's charter: what "finished" looks like.
export const CHARTER = [
  { id: 'park', text: 'Open a park', test: (c) => c.park > 0 },
  { id: 'retail', text: 'Open a General Store or Shopping Strip', test: (c) => c.store + c.mall > 0 },
  { id: 'newspaper', text: 'Print a community newspaper', test: (c) => c.newspaper > 0 },
  { id: 'factoryfarm', text: 'Run a factory farm', test: (c) => c.factoryfarm > 0 },
  { id: 'battery', text: 'Battery-farm chicken and cattle', test: (c) => c.chickens > 0 && c.cattle > 0 },
  { id: 'ev', text: 'Put electric cars on the road', test: (c) => c.evplant > 0 },
  { id: 'renew', text: 'Generate wind and solar power', test: (c) => c.windmill > 0 && c.solar > 0 },
  { id: 'vworks', text: 'Build a Vehicle Works and its hangar', test: (c) => c.vworks > 0 },
  { id: 'msv', text: 'Found a new settlement with an MSV', test: (c, G) => G.settlements.length > 1 },
];

export const TOWN_NAMES = ['New Hope', 'Second Chance', 'Rustwater', 'Fair Ruin', 'Glassfield', 'Tin Haven', 'Morrow', 'Last Light',
  'Greenfall', 'Copper Bend', 'Patchwork', 'Nowhere Else', 'Little Mercy', 'Saltlick', 'Brightwell', 'Ashgrove'];

const ceil = Math.ceil;
// Materials for c build points in a given era. siding adds the plastic for vinyl.
export function costFor(def, era, siding) {
  const c = def.c, o = {};
  if (c > 0) {
    if (era === 0) o.scrap = c;
    else if (era === 1) { o.wood = ceil(c * 0.65); o.scrap = ceil(c * 0.3); }
    else { o.stone = ceil(c * 0.45); o.metal = ceil(c * 0.25); o.glass = ceil(c * 0.15); }
    if (siding) o.plastic = ceil(c * 0.15);
  }
  if (def.extra) for (const k in def.extra) o[k] = (o[k] || 0) + def.extra[k];
  return o;
}
export const ROAD_COST = [{ scrap: 1 }, { scrap: 1, wood: 1 }, { stone: 1 }];
export const BRIDGE_COST = [{ scrap: 4 }, { wood: 3, scrap: 2 }, { stone: 2, metal: 2 }];
export const ROAD_NAME = ['', 'Dirt track', 'Gravel road', 'Asphalt road'];
export const buildTime = (def) => def.bt || 6 + def.c * 0.5;

// How far back in the eras a building can be raised. Anything that depends on Reconstruction has no older form.
const needsRecon = (id) => id === 'reconstruction' || TECH[id].req.some(needsRecon);
export const minEra = (def) => (def.noEra ? null : def.tech && needsRecon(def.tech) ? 2 : 0);
// Build styles offered right now: 0 scrap, 1 timber, 2 masonry, 3 masonry with vinyl siding.
export function stylesFor(def, era, siding) {
  const lo = minEra(def);
  if (lo === null) return [];
  const out = [];
  for (let k = lo; k <= era; k++) out.push(k);
  if (siding && era === 2) out.push(3);
  return out;
}
export const STYLE_NAME = ['Scrap', 'Timber', 'Masonry', 'Vinyl'];

// Plot colours for the plot view, by building category
export const PLOT_COLOR = { defense: '#5a6f96', housing: '#c23b34', food: '#3f9a45', industry: '#7d5531', transport: '#7d5531', power: '#e6c63c', retail: '#c4c4c0', civic: '#f2f2ee' };

// Relative worth of each material at the Trading Post, before the market moves it
export const MARKET_BASE = { food: 1, scrap: 1, wood: 1.4, stone: 1.5, metal: 2.5, glass: 3, plastic: 4 };
export const eraMult = (b) => ERA_MULT[b.era] + (b.siding ? SIDING_MULT : 0);
