// Game data: species, locations, tools. Units are SI (m, kg, s, N·m) unless noted.

// sigma: effective hinge/holding-wood strength (MPa) used by the felling model.
// ductility: hinge bend angle (rad) before fibres tear off. brittle: barber-chair / split tendency.
// hardness: divides cutting speed. price: $ per m³ of merchantable stem.
export const SPECIES = {
  birch:    { name: 'Paper Birch',        sci: 'Betula papyrifera',     density: 880,  sigma: 14, ductility: 0.55, brittle: 0.35, hardness: 1.1, price: 70,  crown: 'broadleaf', crownRatio: 0.55, hMax: 23, crownWidth: 0.85, bark: 'birch',  heart: '#d8c39a', sap: '#efe2c4' },
  aspen:    { name: 'Quaking Aspen',      sci: 'Populus tremuloides',   density: 760,  sigma: 10, ductility: 0.45, brittle: 0.40, hardness: 0.8, price: 45,  crown: 'broadleaf', crownRatio: 0.42, hMax: 25, crownWidth: 0.70, bark: 'aspen',  heart: '#cdbf98', sap: '#ece3c8' },
  lodgepole:{ name: 'Lodgepole Pine',     sci: 'Pinus contorta',        density: 760,  sigma: 12, ductility: 0.70, brittle: 0.20, hardness: 0.9, price: 60,  crown: 'conifer',   crownRatio: 0.38, hMax: 30, crownWidth: 0.75, bark: 'pine',   heart: '#c99a63', sap: '#ead6ae' },
  spruce:   { name: 'Engelmann Spruce',   sci: 'Picea engelmannii',     density: 700,  sigma: 11, ductility: 0.75, brittle: 0.15, hardness: 0.85,price: 75,  crown: 'conifer',   crownRatio: 0.70, hMax: 40, crownWidth: 1.00, bark: 'spruce', heart: '#e2cfa6', sap: '#f1e6cb' },
  ponderosa:{ name: 'Ponderosa Pine',     sci: 'Pinus ponderosa',       density: 850,  sigma: 12, ductility: 0.65, brittle: 0.20, hardness: 0.9, price: 85,  crown: 'conifer',   crownRatio: 0.45, hMax: 45, crownWidth: 1.05, bark: 'ponderosa', heart: '#c48a52', sap: '#ead3a6' },
  dfir:     { name: 'Douglas-fir',        sci: 'Pseudotsuga menziesii', density: 830,  sigma: 18, ductility: 0.95, brittle: 0.15, hardness: 1.0, price: 140, crown: 'conifer',   crownRatio: 0.48, hMax: 72, crownWidth: 0.95, bark: 'dfir',   heart: '#c0703f', sap: '#e6c99a' },
  cedar:    { name: 'Western Redcedar',   sci: 'Thuja plicata',         density: 560,  sigma: 9,  ductility: 0.55, brittle: 0.45, hardness: 0.7, price: 220, crown: 'conifer',   crownRatio: 0.62, hMax: 58, crownWidth: 1.10, bark: 'cedar',  heart: '#a4513a', sap: '#e3c9a0' },
  oak:      { name: 'Northern Red Oak',   sci: 'Quercus rubra',         density: 1000, sigma: 20, ductility: 0.50, brittle: 0.60, hardness: 1.4, price: 180, crown: 'broadleaf', crownRatio: 0.50, hMax: 30, crownWidth: 1.15, bark: 'oak',    heart: '#b98a62', sap: '#e6d2ae' },
  ash:      { name: 'White Ash',          sci: 'Fraxinus americana',    density: 900,  sigma: 19, ductility: 0.35, brittle: 0.85, hardness: 1.3, price: 160, crown: 'broadleaf', crownRatio: 0.45, hMax: 30, crownWidth: 0.90, bark: 'ash',    heart: '#cfb48a', sap: '#efe3c6' },
  maple:    { name: 'Sugar Maple',        sci: 'Acer saccharum',        density: 1000, sigma: 21, ductility: 0.60, brittle: 0.40, hardness: 1.5, price: 200, crown: 'broadleaf', crownRatio: 0.55, hMax: 32, crownWidth: 1.10, bark: 'maple',  heart: '#c9a57a', sap: '#f0e4c8' },
};

// slope: degrees of the hillside (falls toward +x world, i.e. downhill direction is +x).
export const LOCATIONS = [
  {
    id: 'woodlot', name: 'Homestead Woodlot', region: 'Upper Midwest',
    blurb: 'Flat second-growth behind a cabin. Small birch, aspen and pine — axe work. Mind the cabin and the fence line.',
    slope: 2, rough: 0.35, species: ['birch', 'aspen', 'lodgepole'], dbh: [0.14, 0.30], lean: [0, 6],
    wind: [0, 4], trees: 4, basePay: 45, tier: 'axe', hazards: ['cabin', 'fence'],
    ground: ['#4d4a2c', '#5f5633', '#3c3f24'], sky: { turbidity: 6, rayleigh: 1.4, elevation: 32 }, fog: '#b9c4b4', density: 0.016,
  },
  {
    id: 'boreal', name: 'Boreal Spruce Flats', region: 'Northern Ontario',
    blurb: 'Moss and black-spruce bog edges. Straight, tall spruce and pine with tight neighbours — pick your gaps or hang them up.',
    slope: 3, rough: 0.5, species: ['spruce', 'lodgepole', 'aspen'], dbh: [0.22, 0.46], lean: [0, 5],
    wind: [1, 7], trees: 5, basePay: 70, tier: 'saw', hazards: [],
    ground: ['#46512f', '#5b6638', '#39432a'], sky: { turbidity: 9, rayleigh: 2.2, elevation: 18 }, fog: '#aab6b6', density: 0.02,
  },
  {
    id: 'ridge', name: 'Hardwood Ridge', region: 'Allegheny Plateau',
    blurb: 'Sidehill oak, ash and maple. Heavy leaners, brittle ash and a power line along the road. Bore cuts save lives here.',
    slope: 14, rough: 0.8, species: ['oak', 'ash', 'maple'], dbh: [0.34, 0.70], lean: [2, 13],
    wind: [0, 6], trees: 4, basePay: 120, tier: 'saw', hazards: ['powerline'],
    ground: ['#5a4630', '#6d5636', '#4a3a28'], sky: { turbidity: 5, rayleigh: 1.2, elevation: 40 }, fog: '#c9c2b0', density: 0.012,
  },
  {
    id: 'cascade', name: 'Cascade Old Growth', region: 'Western Washington',
    blurb: '30° slope, Douglas-fir and redcedar over 1.5 m on the stump and 60 m tall. Breakage on impact is the enemy — fall them to the bench.',
    slope: 28, rough: 1.4, species: ['dfir', 'cedar', 'dfir', 'spruce'], dbh: [0.75, 1.55], lean: [0, 7],
    wind: [0, 5], trees: 3, basePay: 380, tier: 'bigsaw', hazards: [],
    ground: ['#3f4a2e', '#51603a', '#33402a'], sky: { turbidity: 10, rayleigh: 2.6, elevation: 22 }, fog: '#9fb0ad', density: 0.022,
  },
  {
    id: 'plantation', name: 'Pine Plantation — Block 7', region: 'Interior BC',
    blurb: 'Commercial thinning in rows. Drive the harvester, fell, delimb and buck to length. Throughput pays.',
    slope: 6, rough: 0.6, species: ['ponderosa', 'lodgepole'], dbh: [0.20, 0.42], lean: [0, 4],
    wind: [0, 5], trees: 10, basePay: 30, tier: 'harvester', hazards: [],
    ground: ['#6a5a3a', '#7a6a44', '#574a30'], sky: { turbidity: 4, rayleigh: 1.0, elevation: 48 }, fog: '#d2cbb8', density: 0.01,
  },
];

// kind: 'axe' | 'saw' | 'gear' | 'machine'. bar: guide bar length (m). power: kW (axes use a chop factor).
export const TOOLS = {
  axe:      { kind: 'axe', name: 'Hudson Bay Axe', desc: '1.75 lb head, 24" handle. Honest work.', price: 0, power: 1.0, sweet: 0.16 },
  feller:   { kind: 'axe', name: 'Double-bit Felling Axe', desc: '3.5 lb head, 36" handle. Bigger bites, wider sweet spot.', price: 140, power: 1.6, sweet: 0.22 },
  sawSmall: { kind: 'saw', name: 'Farm Saw 50cc', desc: '18" bar · 2.4 kW. Cuts up to ~0.9 m from both sides.', price: 560, bar: 0.45, power: 2.4 },
  sawPro:   { kind: 'saw', name: 'Pro Saw 70cc', desc: '25" bar · 4.4 kW. Unlocks the bore cut.', price: 1450, bar: 0.63, power: 4.4, bore: true },
  sawBig:   { kind: 'saw', name: 'Falling Saw 92cc', desc: '36" bar · 6.1 kW. Old-growth capable.', price: 2900, bar: 0.91, power: 6.1, bore: true },
  wedges:   { kind: 'gear', name: 'Felling Wedges ×3', desc: 'Drive into the back cut to lift back-leaners and stop pinching.', price: 45 },
  ppe:      { kind: 'gear', name: 'Chaps, Helmet & Boots', desc: 'Halves injury damage.', price: 180 },
  harvester:{ kind: 'machine', name: 'Wheeled Harvester (lease)', desc: '8WD harvester with a 10 m crane and processing head.', price: 9500 },
};

export const NOTCH_PRESETS = {
  open:         { name: 'Open face',     top: 60, bottom: 30, step: 0,    note: '70–90° opening. Hinge controls the tree almost to the ground. Back cut level with the apex.' },
  conventional: { name: 'Conventional',  top: 45, bottom: 0,  step: 0.04, note: '45° top, flat bottom. Notch closes early — hinge breaks at ~45°. Back cut 2–5 cm above apex.' },
  humboldt:     { name: 'Humboldt',      top: 0,  bottom: 45, step: 0.04, note: 'Flat top, angled bottom. Keeps the butt from sliding off the stump on slopes; wastes no butt log.' },
};

export const G = 9.81;
