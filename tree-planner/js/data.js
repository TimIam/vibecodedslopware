// Static catalog data: species, artificial trees, decor, wrapping, currency, landmarks.
// All lengths are inches.

export const CURRENCY = {
  bills: [
    { id: 'b1', label: '$1 bill' }, { id: 'b2', label: '$2 bill' }, { id: 'b5', label: '$5 bill' },
    { id: 'b10', label: '$10 bill' }, { id: 'b20', label: '$20 bill' }, { id: 'b50', label: '$50 bill' },
    { id: 'b100', label: '$100 bill' },
  ],
  // Every current US note is 6.14 x 2.61 in (156 x 66.3 mm).
  bill: { long: 6.14, short: 2.61 },
  coins: [
    { id: 'penny', label: 'Penny (1¢)', d: 0.750 },
    { id: 'nickel', label: 'Nickel (5¢)', d: 0.835 },
    { id: 'dime', label: 'Dime (10¢)', d: 0.705 },
    { id: 'quarter', label: 'Quarter (25¢)', d: 0.955 },
    { id: 'half', label: 'Half dollar (50¢)', d: 1.205 },
    { id: 'dollarcoin', label: 'Dollar coin ($1)', d: 1.043 },
  ],
};
export function currencySize(id) {
  if (!id) return null;
  if (id[0] === 'b') return { kind: 'bill', ...CURRENCY.bill };
  const c = CURRENCY.coins.find(c => c.id === id);
  return c ? { kind: 'coin', d: c.d } : null;
}

// Room landmarks with typical real sizes (mean, sd) in inches.
// kind 'object': the box spans the object's real height, standing on the floor (or a floor
//   handle marks the floor directly below it, e.g. a ceiling bulb's lamp base).
// kind 'elev': the measured value is the height of the box centre above the floor handle.
// depth/width are used for the 3D model; block=true means a tree can't stand there.
export const LANDMARKS = {
  door:     { label: 'Door', kind: 'object', H: 80, sd: 1.5, depth: 2, block: 'front', color: '#ffb347' },
  doorknob: { label: 'Doorknob', kind: 'elev', H: 36, sd: 1.5, color: '#ffd36e' },
  keyway:   { label: 'Deadbolt / keyway', kind: 'elev', H: 42, sd: 3, color: '#ffd36e' },
  switch:   { label: 'Light switch', kind: 'elev', H: 48, sd: 2, color: '#fff27a' },
  outlet:   { label: 'Wall outlet', kind: 'elev', H: 14, sd: 3, outlet: true, color: '#a8ff9e' },
  couch:    { label: 'Couch', kind: 'object', H: 34, sd: 3, depth: 36, block: true, occl: true, topBack: 0.85, color: '#7ec8ff' },
  loveseat: { label: 'Armchair', kind: 'object', H: 36, sd: 4, depth: 32, block: true, occl: true, topBack: 0.85, color: '#7ec8ff' },
  chair:    { label: 'Dining chair', kind: 'object', H: 37, sd: 3, depth: 20, block: true, occl: true, topBack: 0.85, color: '#7ec8ff' },
  bed:      { label: 'Bed (mattress top)', kind: 'object', H: 25, sd: 3, depth: 80, block: true, occl: true, topBack: 1, color: '#c39bff' },
  table:    { label: 'Dining table', kind: 'object', H: 30, sd: 1, depth: 38, block: true, occl: true, topBack: 1, color: '#d9a066' },
  coffee:   { label: 'Coffee table', kind: 'object', H: 18, sd: 2, depth: 24, block: true, occl: true, topBack: 1, color: '#d9a066' },
  tv:       { label: 'TV (55")', kind: 'object', H: 28, sd: 6, depth: 4, block: false, color: '#9aa4b1' },
  floorlamp:{ label: 'Floor lamp', kind: 'object', H: 62, sd: 5, depth: 14, block: true, occl: true, color: '#ffe08a' },
  tablelamp:{ label: 'Table lamp', kind: 'object', H: 24, sd: 5, depth: 12, color: '#ffe08a', floorHandle: true },
  bulb:     { label: 'Light bulb (A19)', kind: 'object', H: 4.3, sd: 0.3, color: '#fffbd0', floorHandle: true },
  window:   { label: 'Window', kind: 'object', H: 48, sd: 10, depth: 1, window: true, color: '#9ff0ff', floorHandle: true },
  plant:    { label: 'Plant / misc', kind: 'object', H: 30, sd: 15, depth: 18, block: true, occl: true, color: '#8fd18f' },
};
// coco-ssd class -> landmark type
export const COCO_MAP = { couch: 'couch', bed: 'bed', chair: 'chair', 'dining table': 'table', tv: 'tv', 'potted plant': 'plant', refrigerator: null };

// --- Real trees -------------------------------------------------------------------------
// style picks the needle texture; width = base diameter / height; retention 1..5.
export const SPECIES = [
  { id: 'fraser', name: 'Fraser Fir', latin: 'Abies fraseri', style: 'fir', color: '#2f5d3a', under: '#9fb7a8', needle: 0.8, width: 0.58, tiers: 15, droop: -0.05, density: 1.0, retention: 5, scent: 3, strength: 5,
    last: 'Excellent. Holds its needles 4 to 6 weeks with steady water; the benchmark for long-lasting trees.',
    about: 'The most-sold tree in the US. Dark blue-green needles with silvery undersides, a tidy narrow shape and stiff, upturned branches that handle heavy ornaments.',
    care: ['Cut 1/2 to 1 inch off the trunk and get it into water within a few hours.', 'Fir drinks hard the first week: up to a gallon a day. Check every morning.', 'Keep it away from heat vents, fireplaces and sunny windows.'],
    id_tips: ['Flat, soft needles 1/2 to 1 in long with a rounded tip.', 'Two bright silver-white stripes on the underside of each needle; twist a twig and the tree flashes silver.', 'Needles curve up around the twig, so you see the twig from below.', 'Smooth gray bark with resin blisters you can pop.'] },
  { id: 'balsam', name: 'Balsam Fir', latin: 'Abies balsamea', style: 'fir', color: '#2c5a36', under: '#8fae98', needle: 1.0, width: 0.52, tiers: 14, droop: -0.02, density: 0.9, retention: 4, scent: 5, strength: 3,
    last: 'Good. 4 weeks or so; keeps its fragrance the whole time.',
    about: 'The classic "Christmas smell". Dark green, slender and pointed, with slightly more flexible branches than Fraser.',
    care: ['Fresh-cut the base and keep the reservoir full: never let the cut end dry out.', 'A cool room (under 70°F) adds a week.', 'Medium ornaments only on the outer tips; the branches bend.'],
    id_tips: ['Flat needles 3/4 to 1 1/2 in, often with a tiny notch at the tip.', 'Two whitish bands underneath, but greener than Fraser overall.', 'Needles spread flat to either side of the twig, like a comb.', 'Crush a needle: strong, sweet balsam scent.'] },
  { id: 'douglas', name: 'Douglas Fir', latin: 'Pseudotsuga menziesii', style: 'douglas', color: '#3a6b3e', under: '#6f9a6a', needle: 1.2, width: 0.64, tiers: 13, droop: 0.06, density: 1.05, retention: 3, scent: 4, strength: 2,
    last: 'Good. 3 to 4 weeks; needles soften but stay on if watered.',
    about: 'Not a true fir. Full, soft and very bushy, with a sweet, fruity smell when needles are crushed. A favorite in the West.',
    care: ['Re-cut and water right away; it seals over fast.', 'Branches are soft: use light ornaments and hang heavier ones near the trunk.', 'Mist is not needed; water in the stand is what matters.'],
    id_tips: ['Soft needles 1 to 1 1/2 in that stick out all around the twig, like a bottle brush.', 'Sharp, shiny, reddish-brown pointed buds at the branch tips.', 'Cones (if any) have three-pointed bracts poking out, like mouse tails.', 'Needles grow from the twig directly, no pegs or bundles.'] },
  { id: 'noble', name: 'Noble Fir', latin: 'Abies procera', style: 'noble', color: '#3d6f5f', under: '#a9c4bb', needle: 1.0, width: 0.56, tiers: 10, droop: -0.08, density: 0.75, retention: 5, scent: 3, strength: 5,
    last: 'Excellent. 5 to 6 weeks; one of the slowest to dry.',
    about: 'Open, tiered layers of stiff branches with gaps between them, great for showing off large or heavy ornaments. Blue-green with a silvery cast.',
    care: ['Can go a little longer before watering after cutting, but still re-cut.', 'Heavy ornaments are fine on any branch.', 'Expect a pricier tree; it is slow-growing.'],
    id_tips: ['Needles curve upward like a hockey stick, leaving the underside of the twig bare.', 'Bluish-green needles about 1 in, four-sided-ish.', 'Distinct horizontal tiers with visible gaps.', 'Very stiff twigs that spring back.'] },
  { id: 'nordmann', name: 'Nordmann Fir', latin: 'Abies nordmanniana', style: 'fir', color: '#1f4f2e', under: '#8db39a', needle: 1.1, width: 0.62, tiers: 13, droop: -0.03, density: 1.0, retention: 5, scent: 1, strength: 4,
    last: 'Excellent. 5 weeks or more; the top choice in Europe for low drop.',
    about: 'Glossy, very dark green and soft to the touch. Little scent, which suits people who find fir fragrance too much.',
    care: ['Water daily; glossy needles hide dryness, so check the reservoir rather than the needles.', 'Tolerates warm rooms better than most.'],
    id_tips: ['Glossy, black-green flat needles about 1 in, with a notched tip.', 'Two white bands underneath.', 'Needles brush forward along the twig and feel soft, not sharp.', 'Almost no smell when crushed.'] },
  { id: 'grand', name: 'Grand Fir', latin: 'Abies grandis', style: 'fir', color: '#2d6a3b', under: '#9dc0a5', needle: 1.6, width: 0.55, tiers: 12, droop: 0.0, density: 0.85, retention: 3, scent: 5, strength: 3,
    last: 'Fair. Around 3 weeks; dries faster than other firs.',
    about: 'Shiny green with long flat needles laid out in neat rows, and a strong citrus scent.',
    care: ['Buy late and keep it cool.', 'Top up water twice a day the first week.'],
    id_tips: ['Long (1 to 2 in) flat glossy needles in two flat rows, like a feather.', 'Needles of different lengths alternate along the twig.', 'Crushed needles smell like tangerine.'] },
  { id: 'concolor', name: 'Concolor (White) Fir', latin: 'Abies concolor', style: 'concolor', color: '#4d7c6c', under: '#b3cbc0', needle: 2.2, width: 0.58, tiers: 12, droop: -0.02, density: 0.9, retention: 4, scent: 4, strength: 3,
    last: 'Good. 4 weeks or so.',
    about: 'Soft, long, silvery blue-green needles and a light citrus smell. Looks a bit like a soft spruce without the prickle.',
    care: ['Standard fir care: fresh cut, full reservoir, away from heat.'],
    id_tips: ['Long (2 to 3 in) flat needles that curve upward.', 'Same powdery blue-gray color on both sides of the needle.', 'Soft and flexible: not sharp like blue spruce.'] },
  { id: 'bluespruce', name: 'Colorado Blue Spruce', latin: 'Picea pungens', style: 'spruce', color: '#5d8094', under: '#87a6b6', needle: 0.9, width: 0.6, tiers: 13, droop: -0.04, density: 1.0, retention: 3, scent: 2, strength: 5,
    last: 'Good if watered: 3 to 4 weeks. Drops fast once it dries out.',
    about: 'Striking powder-blue color and rigid branches that hold anything, but the needles are very sharp. Wear gloves to decorate.',
    care: ['Never let the stand run dry; spruce does not recover.', 'Gloves for decorating; keep away from curious pets and toddlers.'],
    id_tips: ['Square, four-sided needles you can roll between your fingers.', 'Stiff and very sharp at the tip.', 'Each needle sits on a tiny woody peg; bare twigs feel rough.', 'Blue to blue-gray color.'] },
  { id: 'norway', name: 'Norway Spruce', latin: 'Picea abies', style: 'spruce', color: '#2f5a2c', under: '#557b4f', needle: 0.7, width: 0.55, tiers: 14, droop: 0.12, density: 0.95, retention: 1, scent: 3, strength: 3,
    last: 'Poor. 1 to 2 weeks in a warm house before it drops heavily.',
    about: 'The traditional European tree with drooping side twigs. Pretty and cheap, but buy it late and keep it cold.',
    care: ['Buy no more than two weeks before Christmas.', 'Keep the room cool and water constantly.', 'Vacuum often: it sheds.'],
    id_tips: ['Short, shiny dark-green square needles on pegs.', 'Side twigs hang down like curtains from the branches.', 'Long cylindrical cones if present (4 to 7 in).'] },
  { id: 'whitespruce', name: 'White Spruce', latin: 'Picea glauca', style: 'spruce', color: '#4a7356', under: '#7a9d86', needle: 0.6, width: 0.5, tiers: 14, droop: 0.0, density: 0.95, retention: 2, scent: 1, strength: 4,
    last: 'Fair. 2 to 3 weeks.',
    about: 'A dense, symmetrical tree with short blue-green needles, good branch strength, and a famous drawback.',
    care: ['Water daily; drops when dry.', 'Better outdoors on a porch than in a warm room.'],
    id_tips: ['Short (1/2 in) stiff square needles crowding the top of the twig.', 'Crushed needles smell unpleasant (it is nicknamed "cat spruce").', 'Blue-green with a whitish bloom.'] },
  { id: 'scotch', name: 'Scotch Pine', latin: 'Pinus sylvestris', style: 'pine2', color: '#3e6a46', under: '#6f9277', needle: 2.0, width: 0.66, tiers: 12, droop: -0.03, density: 1.0, retention: 5, scent: 3, strength: 5,
    last: 'Excellent. Keeps its needles even after it dries out; 4+ weeks.',
    about: 'The most common US tree for decades. Stiff branches, bright green, and almost no needle drop.',
    care: ['Re-cut and water; pine drinks a lot at first.', 'Sticky sap: wear gloves when setting up.'],
    id_tips: ['Needles in bundles of two, 1 to 3 in long, often twisted.', 'Blue-green to bright green needles.', 'Orange, flaky bark on the upper trunk.'] },
  { id: 'whitepine', name: 'Eastern White Pine', latin: 'Pinus strobus', style: 'pine5', color: '#4b7d55', under: '#7aa682', needle: 4.0, width: 0.7, tiers: 10, droop: 0.08, density: 0.85, retention: 4, scent: 1, strength: 1,
    last: 'Good. 3 to 4 weeks.',
    about: 'Very soft, long, feathery needles and almost no scent, so it suits allergy-prone homes. Branches are too weak for heavy ornaments.',
    care: ['Light ornaments only.', 'Standard fresh-cut and water care.'],
    id_tips: ['Needles in bundles of five (W-H-I-T-E: five letters, five needles).', 'Long, 2 to 5 in, soft and flexible.', 'Bluish-green with fine white lines.'] },
  { id: 'virginia', name: 'Virginia Pine', latin: 'Pinus virginiana', style: 'pine2', color: '#4b7a3e', under: '#7a9a63', needle: 2.0, width: 0.6, tiers: 13, droop: 0.0, density: 1.1, retention: 4, scent: 3, strength: 4,
    last: 'Good. 3 to 4 weeks; a Southern favorite that handles heat.',
    about: 'Dense after shearing, with strong woody branches that hold heavy ornaments. Grown widely in the South.',
    care: ['Very resinous: wipe sap off hands with cooking oil.', 'Standard fresh-cut and water care.'],
    id_tips: ['Short twisted needles in pairs, 1 1/2 to 3 in.', 'Yellow-green to dark green.', 'Small prickly cones that stay on the branches for years.'] },
  { id: 'leyland', name: 'Leyland Cypress', latin: 'x Cuprocyparis leylandii', style: 'cypress', color: '#3e6250', under: '#5f8370', needle: 1.5, width: 0.4, tiers: 16, droop: 0.04, density: 1.15, retention: 4, scent: 0, strength: 2,
    last: 'Good. 3 to 4 weeks, and it has no needles to drop.',
    about: 'Feathery, flat sprays of scale-like foliage with no sap and no smell. A good choice for people allergic to pine.',
    care: ['Water like any cut tree.', 'Light ornaments; branches are slender.'],
    id_tips: ['No needles: tiny overlapping scales on flat, fern-like sprays.', 'Dark green to gray-green.', 'Narrow, columnar shape.'] },
  { id: 'redcedar', name: 'Eastern Red Cedar', latin: 'Juniperus virginiana', style: 'cedar', color: '#3d5e3a', under: '#5d7d56', needle: 1.2, width: 0.42, tiers: 15, droop: 0.02, density: 1.1, retention: 2, scent: 5, strength: 2,
    last: 'Fair. 2 to 3 weeks; dries quickly in a warm room.',
    about: 'A traditional Southern farm tree with a strong cedar-chest smell and little blue berries.',
    care: ['Buy late, keep cool.', 'Prickly young foliage: gloves help.'],
    id_tips: ['Scale-like foliage with some sharp, prickly juvenile needles.', 'Small, frosty-blue berry-like cones.', 'Reddish, shreddy bark.'] },
];

export const ARTIFICIAL = [
  { id: 'pvc', name: 'Classic PVC (green)', style: 'pvc', color: '#2c6b3a', under: '#245a31', needle: 1.0, width: 0.6, tiers: 12, droop: -0.05, density: 1.0, strength: 4, artificial: true,
    about: 'Flat, cut-sheet "tinsel" needles on hinged branches. Inexpensive and full, but looks the most artificial up close.',
    last: 'Lasts 6 to 10 years. No watering.',
    care: ['Fluff every tip: pull each branch tip out and spread its twigs in a fan.', 'Store in an upright bag or a box; crushing ruins the shape.', 'Wipe dust with a dry microfiber cloth.'],
    id_tips: ['Needles are flat strips cut from PVC film, glossy on one side.', 'Every branch tip looks the same.', 'Check for a "fire resistant" label.'] },
  { id: 'pe', name: 'PE "Real Feel"', style: 'pe', color: '#2f5d3a', under: '#3f6d4a', needle: 0.9, width: 0.58, tiers: 14, droop: -0.03, density: 1.0, strength: 4, artificial: true,
    about: 'Needles molded from real branch casts. From a few feet away it passes as a Fraser fir.',
    last: 'Lasts 10+ years.',
    care: ['Fluff from the trunk outward, bottom tier first.', 'Keep out of attics that bake in summer; PE tips can warp.'],
    id_tips: ['Three-dimensional needles with tapered tips.', 'Often mixed with PVC fill near the trunk: a "PE/PVC blend".'] },
  { id: 'flocked', name: 'Flocked white-tipped', style: 'pe', color: '#2f5d3a', under: '#3f6d4a', needle: 0.9, width: 0.6, tiers: 13, droop: -0.03, density: 1.0, strength: 4, artificial: true, flock: 2,
    about: 'Factory snow glued on the tips. Looks wintry, sheds a little white dust the first season.',
    last: 'Lasts 6 to 8 years; flocking yellows if stored in sunlight.',
    care: ['Set up on a sheet the first time to catch flock.', 'Store wrapped in a breathable cover.'],
    id_tips: ['White fiber flocking on branch tops.'] },
  { id: 'white', name: 'All white', style: 'pvc', color: '#eef2f0', under: '#dfe5e2', needle: 1.0, width: 0.58, tiers: 12, droop: -0.05, density: 1.0, strength: 4, artificial: true,
    about: 'Bright white PVC. Colored ornaments pop against it.',
    last: 'Lasts 6 to 10 years; keep away from smoke and cooking grease.', care: ['Dust before storing; white shows grime.'], id_tips: ['Uniform white needles.'] },
  { id: 'silver', name: 'Silver tinsel (retro)', style: 'tinsel', color: '#cfd6dc', under: '#9aa6ae', needle: 1.6, width: 0.55, tiers: 10, droop: 0.0, density: 0.8, strength: 2, artificial: true, metal: true,
    about: 'Mid-century aluminum look: shiny strips on wire branches. Traditionally lit with a color wheel, not string lights.',
    last: 'Lasts decades if stored flat.', care: ['Do NOT put electric lights on a metal tree.', 'Store each branch in its own paper sleeve.'], id_tips: ['Long, shiny metallic strips.'] },
  { id: 'gold', name: 'Gold tinsel', style: 'tinsel', color: '#d8b456', under: '#a8863a', needle: 1.6, width: 0.55, tiers: 10, droop: 0.0, density: 0.8, strength: 2, artificial: true, metal: true,
    about: 'Gold metallic strips. Very reflective.', last: 'Lasts many years.', care: ['Keep lights off metallic trees.'], id_tips: ['Shiny gold strips.'] },
  { id: 'pink', name: 'Pink', style: 'pvc', color: '#f2a6c4', under: '#d98aa9', needle: 1.0, width: 0.58, tiers: 12, droop: -0.05, density: 1.0, strength: 4, artificial: true,
    about: 'Candy-pink PVC. Works with silver and white decor.', last: 'Lasts 6 to 10 years.', care: ['Fluff and store as for any PVC tree.'], id_tips: ['Pink PVC needles.'] },
  { id: 'black', name: 'Black', style: 'pvc', color: '#1b1e1c', under: '#2a2e2b', needle: 1.0, width: 0.58, tiers: 12, droop: -0.05, density: 1.0, strength: 4, artificial: true,
    about: 'Matte black. Makes lights and metallic ornaments glow.', last: 'Lasts 6 to 10 years.', care: ['Fluff and store as for any PVC tree.'], id_tips: ['Black PVC needles.'] },
  { id: 'blue', name: 'Blue', style: 'pvc', color: '#3f6fb8', under: '#2f5a98', needle: 1.0, width: 0.58, tiers: 12, droop: -0.05, density: 1.0, strength: 4, artificial: true,
    about: 'Bold blue PVC; pair with silver and white.', last: 'Lasts 6 to 10 years.', care: ['Fluff and store as for any PVC tree.'], id_tips: ['Blue PVC needles.'] },
  { id: 'fiber', name: 'Fiber-optic', style: 'fiber', color: '#2b5c37', under: '#244d2e', needle: 1.0, width: 0.5, tiers: 11, droop: 0.0, density: 0.85, strength: 2, artificial: true, fiber: true,
    about: 'A light source in the base sends color through fiber strands that glow at the tips. Usually small (2 to 6 ft).',
    last: 'Lasts years; the bulb or LED in the base may need replacing.', care: ['Spread the fiber bundles evenly.', 'Keep the base fan vent clear.'], id_tips: ['Clear fibers ending in glowing dots.'] },
  { id: 'pencil', name: 'Slim / pencil', style: 'pe', color: '#2f5d3a', under: '#3f6d4a', needle: 0.9, width: 0.32, tiers: 16, droop: -0.03, density: 1.05, strength: 3, artificial: true,
    about: 'About half the width of a full tree. Fits tight corners and apartments.', last: 'Lasts 10 years.', care: ['Use shorter garland swags; there is less room for them.'], id_tips: ['Width under 35% of height.'] },
  { id: 'prelit', name: 'Pre-lit PE/PVC', style: 'pe', color: '#2c5a37', under: '#3a6a46', needle: 0.9, width: 0.58, tiers: 14, droop: -0.03, density: 1.0, strength: 4, artificial: true, prelit: true,
    about: 'Lights are already wired into the branches (warm white here). When one section fails, a bulb tester finds the dead bulb.',
    last: 'Tree 10 years; lights often 5 to 7.', care: ['Unplug before fluffing.', 'Keep spare bulbs and fuses from the box.'], id_tips: ['Wires run along every branch.'] },
];
export const ALL_TREES = [...SPECIES, ...ARTIFICIAL];
export const treeById = id => ALL_TREES.find(t => t.id === id) || SPECIES[0];

// --- Decor ------------------------------------------------------------------------------
export const PALETTE = {
  red: '#c3192b', crimson: '#8e0f22', gold: '#d4a640', silver: '#c9ced3', green: '#1f7a3e', blue: '#2251b8', ice: '#9fd3ff',
  purple: '#6b2fa8', pink: '#f08ab8', white: '#f5f5f2', copper: '#b8683c', champagne: '#e3cf9f', black: '#1c1c1c', teal: '#1d8a8a',
};
export const ORN_SIZES = { S: 2, M: 3, L: 4, XL: 5 };

// Ornament kinds. finish: shiny | matte | glitter | mercury | clear
export const ORNAMENTS = [
  { id: 'ball', label: 'Glass ball', colors: Object.keys(PALETTE), finishes: ['shiny', 'matte', 'glitter', 'mercury', 'clear'] },
  { id: 'teardrop', label: 'Teardrop', colors: Object.keys(PALETTE), finishes: ['shiny', 'matte', 'glitter'] },
  { id: 'finial', label: 'Finial', colors: Object.keys(PALETTE), finishes: ['shiny', 'glitter', 'mercury'] },
  { id: 'onion', label: 'Onion dome', colors: Object.keys(PALETTE), finishes: ['shiny', 'matte', 'glitter'] },
  { id: 'icicle', label: 'Glass icicle', colors: ['white', 'ice', 'silver', 'gold'], finishes: ['clear', 'shiny'] },
  { id: 'bell', label: 'Bell', colors: ['gold', 'silver', 'red', 'copper', 'green'], finishes: ['shiny', 'matte'] },
  { id: 'snowflake', label: 'Snowflake', colors: ['white', 'silver', 'gold', 'ice'], finishes: ['glitter', 'shiny'] },
  { id: 'star', label: 'Star', colors: ['gold', 'silver', 'red', 'white'], finishes: ['shiny', 'glitter'] },
  { id: 'heart', label: 'Heart', colors: ['red', 'pink', 'gold', 'silver'], finishes: ['shiny', 'glitter', 'matte'] },
  { id: 'candycane', label: 'Candy cane', colors: ['red', 'green'], finishes: ['shiny'] },
  { id: 'pinecone', label: 'Pinecone', colors: ['copper', 'white', 'gold'], finishes: ['matte', 'glitter'] },
  { id: 'gingerbread', label: 'Gingerbread', colors: ['copper'], finishes: ['matte'] },
  { id: 'bird', label: 'Clip-on bird', colors: ['red', 'white', 'gold', 'blue'], finishes: ['matte', 'glitter'] },
];
export const GARLANDS = [
  { id: 'beads', label: 'Bead garland', colors: ['gold', 'silver', 'red', 'champagne', 'white', 'copper', 'blue', 'green', 'purple'] },
  { id: 'tinselg', label: 'Tinsel garland', colors: ['gold', 'silver', 'red', 'green', 'blue', 'purple', 'pink', 'copper', 'champagne', 'white'] },
  { id: 'ribbon', label: 'Ribbon', colors: ['red', 'gold', 'silver', 'green', 'blue', 'white', 'purple', 'plaid'] },
  { id: 'popcorn', label: 'Popcorn & cranberry', colors: ['red'] },
  { id: 'wood', label: 'Wood bead', colors: ['champagne', 'white', 'red'] },
];
export const TINSELS = ['silver', 'gold', 'rainbow', 'red', 'green', 'blue', 'purple', 'pink', 'holo'];
export const LIGHTS = {
  bulbs: [{ id: 'mini', label: 'Mini', size: 0.35 }, { id: 'c7', label: 'C7', size: 0.7 }, { id: 'c9', label: 'C9', size: 1.0 }, { id: 'globe', label: 'LED globe', size: 0.55 }],
  colors: [{ id: 'multi', label: 'Multicolor' }, { id: 'warm', label: 'Warm white' }, { id: 'cool', label: 'Cool white' }, { id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }, { id: 'redgreen', label: 'Red & green' }, { id: 'purple', label: 'Purple' }],
  modes: [{ id: 'steady', label: 'Steady' }, { id: 'glow', label: 'Slow glow' }, { id: 'blink', label: 'Blink' }, { id: 'twinkle', label: 'Twinkle' }, { id: 'chase', label: 'Chase' }, { id: 'off', label: 'Off (unlit)' }],
};
export const TOPPERS = [
  { id: 'star', label: 'Star', colors: ['gold', 'silver', 'red', 'white'] },
  { id: 'litstar', label: 'Lighted star', colors: ['gold', 'white', 'ice'] },
  { id: 'angel', label: 'Angel', colors: ['white', 'gold', 'ice', 'red'] },
  { id: 'bow', label: 'Big bow', colors: ['red', 'gold', 'silver', 'green', 'plaid'] },
  { id: 'snowflake', label: 'Snowflake', colors: ['white', 'silver', 'gold', 'ice'] },
  { id: 'finial', label: 'Glass spire', colors: ['gold', 'silver', 'red', 'blue', 'ice'] },
];
export const SKIRTS = [
  { id: 'velvet', label: 'Velvet with trim' }, { id: 'quilted', label: 'Quilted' }, { id: 'fur', label: 'Faux fur' },
  { id: 'plaid', label: 'Plaid' }, { id: 'knit', label: 'Knit' }, { id: 'sequin', label: 'Sequin' }, { id: 'burlap', label: 'Burlap' },
];
export const PAPERS = [
  { id: 'candystripe', label: 'Candy stripe', c1: '#c3192b', c2: '#ffffff' },
  { id: 'buffalo', label: 'Buffalo check', c1: '#b5121b', c2: '#141414' },
  { id: 'tartan', label: 'Tartan', c1: '#1f5a36', c2: '#a8141f' },
  { id: 'dots', label: 'Polka dots', c1: '#1f6e43', c2: '#ffffff' },
  { id: 'snowflakes', label: 'Snowflakes', c1: '#16305e', c2: '#ffffff' },
  { id: 'kraft', label: 'Kraft & stars', c1: '#b48a5a', c2: '#ffffff' },
  { id: 'gold', label: 'Metallic gold', c1: '#d4a640', c2: '#f4dc8a' },
  { id: 'silver', label: 'Metallic silver', c1: '#bfc6cc', c2: '#eef2f5' },
  { id: 'trees', label: 'Little trees', c1: '#f3eee2', c2: '#2b7a46' },
  { id: 'reindeer', label: 'Reindeer', c1: '#9c1b25', c2: '#f1e6d0' },
  { id: 'gingham', label: 'Gingham', c1: '#2b6cb0', c2: '#ffffff' },
  { id: 'holly', label: 'Holly', c1: '#f6f3ea', c2: '#1f6b3a' },
  { id: 'solid', label: 'Solid color', c1: '#7a1f7a', c2: '#7a1f7a' },
];
export const BOXES = [
  { id: 'jewelry', label: 'Jewelry box', w: 4, d: 4, h: 3 },
  { id: 'small', label: 'Small', w: 8, d: 6, h: 4 },
  { id: 'shirt', label: 'Shirt box', w: 15, d: 10, h: 2.5 },
  { id: 'shoe', label: 'Shoe box', w: 13, d: 8, h: 5 },
  { id: 'cube', label: 'Big cube', w: 14, d: 14, h: 14 },
  { id: 'tall', label: 'Tall box', w: 8, d: 8, h: 18 },
  { id: 'long', label: 'Long box', w: 28, d: 6, h: 6 },
  { id: 'large', label: 'Large', w: 20, d: 16, h: 10 },
];
export const RIBBONS = [{ id: 'none', label: 'None' }, { id: 'cross', label: 'Cross' }, { id: 'single', label: 'Single band' }, { id: 'double', label: 'Double cross' }, { id: 'diagonal', label: 'Diagonal' }];
export const BOWS = [{ id: 'none', label: 'None' }, { id: 'loopy', label: 'Classic loop bow' }, { id: 'pull', label: 'Pull bow (pom)' }, { id: 'flat', label: 'Flat tied bow' }, { id: 'rosette', label: 'Star rosette' }, { id: 'curly', label: 'Curling ribbon' }];
export const CARDS = [{ id: 'none', label: 'None' }, { id: 'tag', label: 'To/From tag' }, { id: 'note', label: 'Folded note card' }, { id: 'envelope', label: 'Envelope' }];
export const RIBBON_COLORS = ['#c3192b', '#d4a640', '#c9ced3', '#1f7a3e', '#2251b8', '#f5f5f2', '#6b2fa8', '#f08ab8', '#1c1c1c', '#b8683c'];

export const THEMES = [
  { id: 'classic', label: 'Classic red & gold', orn: [['ball', 'red', 'shiny'], ['ball', 'gold', 'glitter'], ['teardrop', 'red', 'matte'], ['bell', 'gold', 'shiny'], ['finial', 'gold', 'shiny'], ['candycane', 'red', 'shiny']], garland: ['beads', 'gold'], tinsel: null, lights: ['mini', 'warm', 'steady'], topper: ['star', 'gold'], skirt: ['velvet', '#a3121f'] },
  { id: 'frost', label: 'Silver & ice blue', orn: [['ball', 'silver', 'mercury'], ['ball', 'ice', 'shiny'], ['snowflake', 'white', 'glitter'], ['icicle', 'ice', 'clear'], ['ball', 'blue', 'matte']], garland: ['tinselg', 'silver'], tinsel: 'silver', lights: ['mini', 'cool', 'twinkle'], topper: ['snowflake', 'silver'], skirt: ['fur', '#f4f6f8'] },
  { id: 'rustic', label: 'Rustic farmhouse', orn: [['pinecone', 'copper', 'matte'], ['ball', 'white', 'matte'], ['gingerbread', 'copper', 'matte'], ['ball', 'red', 'matte'], ['bird', 'red', 'matte']], garland: ['wood', 'champagne'], tinsel: null, lights: ['c7', 'warm', 'steady'], topper: ['bow', 'plaid'], skirt: ['burlap', '#a88a62'] },
  { id: 'retro', label: 'Retro multicolor', orn: [['ball', 'red', 'shiny'], ['ball', 'blue', 'shiny'], ['ball', 'green', 'shiny'], ['ball', 'gold', 'shiny'], ['ball', 'pink', 'shiny'], ['onion', 'teal', 'shiny']], garland: ['tinselg', 'silver'], tinsel: 'silver', lights: ['c9', 'multi', 'steady'], topper: ['finial', 'red'], skirt: ['velvet', '#1f6b3a'] },
  { id: 'victorian', label: 'Victorian', orn: [['finial', 'gold', 'mercury'], ['heart', 'red', 'glitter'], ['teardrop', 'crimson', 'glitter'], ['ball', 'champagne', 'mercury'], ['bird', 'white', 'glitter']], garland: ['ribbon', 'gold'], tinsel: 'gold', lights: ['mini', 'warm', 'glow'], topper: ['angel', 'gold'], skirt: ['quilted', '#7a1020'] },
  { id: 'candy', label: 'Candy land', orn: [['candycane', 'red', 'shiny'], ['ball', 'pink', 'glitter'], ['heart', 'pink', 'shiny'], ['star', 'white', 'glitter'], ['ball', 'white', 'shiny']], garland: ['popcorn', 'red'], tinsel: 'pink', lights: ['globe', 'multi', 'chase'], topper: ['star', 'red'], skirt: ['knit', '#e9e2d6'] },
];
