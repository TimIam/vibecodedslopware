// Pour Decisions: every bottle on the shelf, the glasses, the garnishes, and the recipe book.
// Amounts are US fluid ounces; "dash" ingredients count dashes. Specs follow common modern bar
// practice (IBA where it has one), rounded to quarter ounces so they can be free-poured.

const ING = {};
function ing(key, name, abv, color, kind, shape) { ING[key] = { key, name, abv, color, kind, shape: shape || kind }; }

// Spirits
ing('vodka', 'Vodka', 40, '#dcecf2', 'spirit', 'tall');
ing('gin', 'Gin', 40, '#d8f0e6', 'spirit', 'square');
ing('rum', 'Light Rum', 40, '#f1ead6', 'spirit', 'tall');
ing('darkrum', 'Dark Rum', 40, '#6b3510', 'spirit', 'round');
ing('tequila', 'Tequila', 40, '#f3e6b3', 'spirit', 'square');
ing('bourbon', 'Bourbon', 45, '#b8661c', 'spirit', 'square');
ing('rye', 'Rye Whiskey', 45, '#a55a1c', 'spirit', 'tall');
ing('scotch', 'Scotch', 40, '#c98a2c', 'spirit', 'round');
ing('irish', 'Irish Whiskey', 40, '#c4862e', 'spirit', 'tall');
ing('brandy', 'Brandy', 40, '#8e4416', 'spirit', 'round');
ing('cachaca', 'Cachaça', 40, '#eee8d0', 'spirit', 'tall');
// Wine
ing('sparkling', 'Sparkling Wine', 12, '#f5e9a8', 'wine', 'wine');
ing('redwine', 'Red Wine', 13, '#6e0f1f', 'wine', 'wine');
// Liqueurs, vermouths, aperitivi
ing('triplesec', 'Triple Sec', 30, '#f4f0dc', 'liqueur', 'tall');
ing('coffee', 'Coffee Liqueur', 20, '#2b1608', 'liqueur', 'round');
ing('amaretto', 'Amaretto', 24, '#a8521b', 'liqueur', 'square');
ing('irishcream', 'Irish Cream', 17, '#d9bf98', 'liqueur', 'round');
ing('cacao', 'Crème de Cacao', 20, '#5a3018', 'liqueur', 'tall');
ing('menthe', 'Crème de Menthe', 25, '#2fb34a', 'liqueur', 'tall');
ing('peach', 'Peach Schnapps', 20, '#f7c58a', 'liqueur', 'tall');
ing('melon', 'Melon Liqueur', 20, '#7ed957', 'liqueur', 'square');
ing('bluecur', 'Blue Curaçao', 25, '#1e8ee8', 'liqueur', 'tall');
ing('galliano', 'Galliano', 30, '#f2d21b', 'liqueur', 'tall');
ing('raspberry', 'Raspberry Liqueur', 17, '#7d1438', 'liqueur', 'round');
ing('maraschino', 'Maraschino', 32, '#f2f2ea', 'liqueur', 'square');
ing('benedictine', 'Bénédictine', 40, '#c88a1e', 'liqueur', 'round');
ing('drambuie', 'Drambuie', 40, '#d39a2b', 'liqueur', 'square');
ing('chartreuse', 'Green Chartreuse', 55, '#9fd13a', 'liqueur', 'tall');
ing('elderflower', 'Elderflower Liqueur', 20, '#f1ecc0', 'liqueur', 'square');
ing('cassis', 'Crème de Cassis', 16, '#4a0d2a', 'liqueur', 'round');
ing('campari', 'Campari', 25, '#d21f2b', 'liqueur', 'tall');
ing('aperol', 'Aperol', 11, '#f2661e', 'liqueur', 'tall');
ing('swvermouth', 'Sweet Vermouth', 16, '#7a2a16', 'liqueur', 'tall');
ing('dryvermouth', 'Dry Vermouth', 18, '#ece6c4', 'liqueur', 'tall');
ing('lillet', 'Lillet Blanc', 17, '#f0dc8a', 'liqueur', 'round');
// Mixers, juices, syrups
ing('cola', 'Cola', 0, '#3b1a0c', 'mixer', 'soda');
ing('tonic', 'Tonic', 0, '#eef6f8', 'mixer', 'soda');
ing('soda', 'Soda Water', 0, '#eef6fa', 'mixer', 'soda');
ing('gingerale', 'Ginger Ale', 0, '#e7cf86', 'mixer', 'soda');
ing('gingerbeer', 'Ginger Beer', 0, '#d8b66a', 'mixer', 'soda');
ing('lemonlime', 'Lemon-Lime Soda', 0, '#eaf7d8', 'mixer', 'soda');
ing('oj', 'Orange Juice', 0, '#ffa526', 'mixer', 'carton');
ing('cranberry', 'Cranberry Juice', 0, '#c0142f', 'mixer', 'carton');
ing('pineapple', 'Pineapple Juice', 0, '#f7dc54', 'mixer', 'carton');
ing('grapefruit', 'Grapefruit Juice', 0, '#f59c86', 'mixer', 'carton');
ing('tomato', 'Tomato Juice', 0, '#c8281e', 'mixer', 'carton');
ing('passion', 'Passion Fruit Juice', 0, '#f2b62a', 'mixer', 'carton');
ing('peachpuree', 'Peach Purée', 0, '#f8b27c', 'mixer', 'carton');
ing('lime', 'Lime Juice', 0, '#c8e07a', 'mixer', 'squeeze');
ing('lemon', 'Lemon Juice', 0, '#f6ec8a', 'mixer', 'squeeze');
ing('simple', 'Simple Syrup', 0, '#f6f4ea', 'mixer', 'squeeze');
ing('honey', 'Honey Syrup', 0, '#e8b84a', 'mixer', 'squeeze');
ing('agave', 'Agave Syrup', 0, '#e2b45a', 'mixer', 'squeeze');
ing('orgeat', 'Orgeat', 0, '#efe6d2', 'mixer', 'squeeze');
ing('grenadine', 'Grenadine', 0, '#b5102c', 'mixer', 'squeeze');
ing('cream', 'Cream', 0, '#fbf6ea', 'mixer', 'carton');
ing('coconut', 'Cream of Coconut', 0, '#fbf8f0', 'mixer', 'carton');
ing('espresso', 'Espresso', 0, '#2a160b', 'mixer', 'pot');
ing('hotcoffee', 'Hot Coffee', 0, '#3a210f', 'mixer', 'pot');
ing('hotwater', 'Hot Water', 0, '#e9f3f7', 'mixer', 'pot');
// Counted in dashes
ing('angostura', 'Angostura Bitters', 45, '#7a1a10', 'dash');
ing('orangebitters', 'Orange Bitters', 45, '#e08a2a', 'dash');
ing('peychauds', "Peychaud's Bitters", 35, '#c42a2a', 'dash');
ing('absinthe', 'Absinthe (rinse)', 60, '#9ad06a', 'dash');
ing('worcestershire', 'Worcestershire', 0, '#3a1a0a', 'dash');
ing('hotsauce', 'Hot Sauce', 0, '#d8301c', 'dash');

const GARNISH = {
  lime: 'Lime', lemon: 'Lemon', orange: 'Orange', cherry: 'Cherry', olive: 'Olive', onion: 'Cocktail Onion',
  mint: 'Mint', celery: 'Celery', pineapple: 'Pineapple', nutmeg: 'Nutmeg', beans: 'Coffee Beans',
  saltrim: 'Salt Rim', sugarrim: 'Sugar Rim',
};

const METHODS = { build: 'Build', stir: 'Stir', shake: 'Shake', blend: 'Blend' };

// Glasses share a 120x170 drawing box. `inside` is the liquid's clip shape; `top`/`bot` its fill range.
const GLASSES = {
  rocks: { name: 'Rocks', cap: 8, inside: 'M20,70 L100,70 L96,148 L24,148Z', top: 70, bot: 148, extra: 'M24,148 L96,148 L95,160 L25,160Z' },
  highball: { name: 'Highball', cap: 12, inside: 'M30,28 L90,28 L87,150 L33,150Z', top: 28, bot: 150, extra: 'M33,150 L87,150 L86,160 L34,160Z' },
  collins: { name: 'Collins', cap: 14, inside: 'M37,10 L83,10 L82,152 L38,152Z', top: 10, bot: 152, extra: 'M38,152 L82,152 L82,162 L38,162Z' },
  martini: { name: 'Martini', cap: 6, inside: 'M10,32 L110,32 L60,96Z', top: 32, bot: 96, extra: 'M58,96 L62,96 L62,154 L58,154Z M30,162 Q60,148 90,162Z' },
  coupe: { name: 'Coupe', cap: 6, inside: 'M12,40 Q12,96 60,96 Q108,96 108,40Z', top: 40, bot: 96, extra: 'M58,96 L62,96 L62,154 L58,154Z M30,162 Q60,148 90,162Z' },
  shot: { name: 'Shot', cap: 2, inside: 'M40,100 L80,100 L77,150 L43,150Z', top: 100, bot: 150, extra: 'M43,150 L77,150 L77,162 L43,162Z' },
  hurricane: { name: 'Hurricane', cap: 16, inside: 'M38,18 C30,60 52,72 42,108 C36,132 48,140 60,140 C72,140 84,132 78,108 C68,72 90,60 82,18Z', top: 18, bot: 140, extra: 'M57,140 L63,140 L63,154 L57,154Z M34,162 Q60,148 86,162Z' },
  mug: { name: 'Copper Mug', cap: 14, inside: 'M26,42 L88,42 L88,152 L26,152Z', top: 42, bot: 152, extra: 'M26,152 L88,152 L88,160 L26,160Z', handle: 'M88,62 C114,62 114,130 88,130', copper: true },
  wine: { name: 'Wine', cap: 12, inside: 'M28,22 C22,70 38,96 60,96 C82,96 98,70 92,22Z', top: 22, bot: 96, extra: 'M58,96 L62,96 L62,154 L58,154Z M30,162 Q60,148 90,162Z' },
  flute: { name: 'Flute', cap: 6, inside: 'M46,10 C43,55 47,96 60,100 C73,96 77,55 74,10Z', top: 10, bot: 100, extra: 'M58,100 L62,100 L62,154 L58,154Z M36,162 Q60,148 84,162Z' },
  margarita: { name: 'Margarita', cap: 12, inside: 'M8,34 Q60,46 112,34 Q100,64 72,66 Q64,68 64,80 Q62,92 60,94 Q58,92 56,80 Q56,68 48,66 Q20,64 8,34Z', top: 36, bot: 94, extra: 'M58,94 L62,94 L62,154 L58,154Z M30,162 Q60,148 90,162Z' },
  irish: { name: 'Irish Coffee', cap: 10, inside: 'M34,30 L86,30 L82,118 L38,118Z', top: 30, bot: 118, extra: 'M57,118 L63,118 L63,150 L57,150Z M36,160 Q60,146 84,160Z', handle: 'M85,46 C106,46 106,100 83,100' },
};

const RECIPES = [];
function R(name, glass, method, ice, ings, garnish = '') {
  RECIPES.push({
    name, glass, method, ice: !!ice,
    ings: ings.split(',').map(s => { const [k, a] = s.trim().split(/\s+/); if (!ING[k]) throw new Error(name + ': ' + k); return { k, a: +a }; }),
    garnish: garnish ? garnish.split(',').map(s => { s = s.trim(); if (!GARNISH[s]) throw new Error(name + ': ' + s); return s; }) : [],
  });
}

// Vodka
R('Screwdriver', 'highball', 'build', 1, 'vodka 1.5, oj 4', 'orange');
R('Cape Codder', 'highball', 'build', 1, 'vodka 1.5, cranberry 4', 'lime');
R('Sea Breeze', 'highball', 'build', 1, 'vodka 1.5, cranberry 3, grapefruit 1', 'lime');
R('Bay Breeze', 'highball', 'build', 1, 'vodka 1.5, cranberry 3, pineapple 1', 'lime');
R('Madras', 'highball', 'build', 1, 'vodka 1.5, cranberry 3, oj 1', 'orange');
R('Greyhound', 'highball', 'build', 1, 'vodka 1.5, grapefruit 4');
R('Salty Dog', 'highball', 'build', 1, 'vodka 1.5, grapefruit 4', 'saltrim');
R('Moscow Mule', 'mug', 'build', 1, 'vodka 2, gingerbeer 4, lime 0.5', 'lime');
R('Cosmopolitan', 'martini', 'shake', 0, 'vodka 1.5, triplesec 0.5, lime 0.5, cranberry 1', 'lime');
R('Black Russian', 'rocks', 'build', 1, 'vodka 2, coffee 1');
R('White Russian', 'rocks', 'build', 1, 'vodka 2, coffee 1, cream 1');
R('Mudslide', 'rocks', 'shake', 1, 'vodka 1, coffee 1, irishcream 1');
R('Bloody Mary', 'highball', 'build', 1, 'vodka 1.5, tomato 3, lemon 0.5, worcestershire 2, hotsauce 2', 'celery, lemon');
R('Vodka Martini', 'martini', 'stir', 0, 'vodka 2.5, dryvermouth 0.5', 'olive');
R('Vesper', 'martini', 'shake', 0, 'gin 3, vodka 1, lillet 0.5', 'lemon');
R('Kamikaze', 'martini', 'shake', 0, 'vodka 1, triplesec 1, lime 1', 'lime');
R('Lemon Drop', 'martini', 'shake', 0, 'vodka 1.5, triplesec 0.5, lemon 0.75, simple 0.5', 'sugarrim, lemon');
R('Sex on the Beach', 'highball', 'build', 1, 'vodka 1.5, peach 0.5, oj 2, cranberry 2', 'orange');
R('Woo Woo', 'highball', 'build', 1, 'vodka 1.5, peach 0.5, cranberry 3', 'lime');
R('Harvey Wallbanger', 'highball', 'build', 1, 'vodka 1.5, oj 4, galliano 0.5', 'orange, cherry');
R('Espresso Martini', 'martini', 'shake', 0, 'vodka 1.5, coffee 0.5, espresso 1, simple 0.25', 'beans');
R('Godmother', 'rocks', 'build', 1, 'vodka 1.5, amaretto 0.75');
R('Blue Lagoon', 'highball', 'build', 1, 'vodka 1.5, bluecur 0.75, lemonlime 4', 'cherry');
R('Vodka Tonic', 'highball', 'build', 1, 'vodka 1.5, tonic 4', 'lime');
R('Vodka Soda', 'highball', 'build', 1, 'vodka 1.5, soda 4', 'lime');
R('Vodka Gimlet', 'coupe', 'shake', 0, 'vodka 2, lime 0.75, simple 0.75', 'lime');
R('French Martini', 'martini', 'shake', 0, 'vodka 1.5, raspberry 0.5, pineapple 1.5');
R('Chi-Chi', 'hurricane', 'blend', 1, 'vodka 1.5, coconut 1, pineapple 3', 'pineapple, cherry');
R('Melon Ball', 'highball', 'build', 1, 'vodka 1, melon 1, pineapple 3');
R('Hairy Navel', 'highball', 'build', 1, 'vodka 1, peach 1, oj 4', 'orange');
R('Mind Eraser', 'rocks', 'build', 1, 'vodka 1, coffee 1, soda 2');
R('Electric Lemonade', 'highball', 'build', 1, 'vodka 1.5, bluecur 0.5, lemon 1, simple 0.5, lemonlime 2', 'lemon');
R('Long Island Iced Tea', 'collins', 'build', 1, 'vodka 0.5, gin 0.5, rum 0.5, tequila 0.5, triplesec 0.5, lemon 0.75, simple 0.5, cola 1', 'lemon');
R('Long Beach Iced Tea', 'collins', 'build', 1, 'vodka 0.5, gin 0.5, rum 0.5, tequila 0.5, triplesec 0.5, lemon 0.75, simple 0.5, cranberry 1', 'lemon');
R('Adios', 'collins', 'build', 1, 'vodka 0.5, gin 0.5, rum 0.5, tequila 0.5, bluecur 0.5, lemon 0.75, simple 0.5, lemonlime 1', 'lemon');
// Gin
R('Gin & Tonic', 'highball', 'build', 1, 'gin 1.5, tonic 4', 'lime');
R('Martini', 'martini', 'stir', 0, 'gin 2.5, dryvermouth 0.5', 'olive');
R('Gibson', 'martini', 'stir', 0, 'gin 2.5, dryvermouth 0.5', 'onion');
R('Gimlet', 'coupe', 'shake', 0, 'gin 2, lime 0.75, simple 0.75', 'lime');
R('Tom Collins', 'collins', 'build', 1, 'gin 2, lemon 1, simple 0.5, soda 2', 'lemon, cherry');
R('Negroni', 'rocks', 'stir', 1, 'gin 1, campari 1, swvermouth 1', 'orange');
R('French 75', 'flute', 'shake', 0, 'gin 1, lemon 0.5, simple 0.5, sparkling 3', 'lemon');
R('Gin Fizz', 'highball', 'shake', 0, 'gin 2, lemon 1, simple 0.75, soda 1', 'lemon');
R('Gin Rickey', 'highball', 'build', 1, 'gin 2, lime 0.5, soda 4', 'lime');
R("Bee's Knees", 'coupe', 'shake', 0, 'gin 2, lemon 0.75, honey 0.75', 'lemon');
R('Last Word', 'coupe', 'shake', 0, 'gin 0.75, chartreuse 0.75, maraschino 0.75, lime 0.75', 'cherry');
R('Corpse Reviver #2', 'coupe', 'shake', 0, 'gin 0.75, lillet 0.75, triplesec 0.75, lemon 0.75, absinthe 1', 'orange');
R('White Lady', 'coupe', 'shake', 0, 'gin 1.5, triplesec 1, lemon 0.75', 'lemon');
R('Southside', 'coupe', 'shake', 0, 'gin 2, lime 1, simple 0.75', 'mint');
R('Gin Buck', 'highball', 'build', 1, 'gin 2, lime 0.5, gingerale 4', 'lime');
R('Martinez', 'coupe', 'stir', 0, 'gin 1.5, swvermouth 1.5, maraschino 0.25, orangebitters 2', 'lemon');
R('Bronx', 'coupe', 'shake', 0, 'gin 1.5, swvermouth 0.5, dryvermouth 0.5, oj 1', 'orange');
// Rum
R('Mojito', 'collins', 'build', 1, 'rum 2, lime 1, simple 0.75, soda 2', 'mint, lime');
R('Daiquiri', 'coupe', 'shake', 0, 'rum 2, lime 1, simple 0.75', 'lime');
R('Frozen Daiquiri', 'margarita', 'blend', 1, 'rum 2, lime 1, simple 0.75', 'lime');
R('Piña Colada', 'hurricane', 'blend', 1, 'rum 2, coconut 1.5, pineapple 3', 'pineapple, cherry');
R('Cuba Libre', 'highball', 'build', 1, 'rum 2, cola 4, lime 0.5', 'lime');
R('Rum & Coke', 'highball', 'build', 1, 'rum 1.5, cola 4');
R("Dark 'n' Stormy", 'highball', 'build', 1, 'darkrum 2, gingerbeer 4', 'lime');
R('Mai Tai', 'rocks', 'shake', 1, 'rum 1, darkrum 1, triplesec 0.5, orgeat 0.5, lime 0.75', 'mint, lime');
R('Hurricane', 'hurricane', 'shake', 1, 'rum 2, darkrum 2, passion 2, oj 1, lime 0.5, simple 0.5, grenadine 0.25', 'orange, cherry');
R("Planter's Punch", 'hurricane', 'shake', 1, 'darkrum 1.5, oj 1, pineapple 1, lime 0.5, grenadine 0.25, angostura 2', 'orange, cherry');
R('El Presidente', 'coupe', 'stir', 0, 'rum 1.5, dryvermouth 0.75, triplesec 0.25, grenadine 0.25', 'orange');
R('Hemingway Daiquiri', 'coupe', 'shake', 0, 'rum 2, maraschino 0.25, grapefruit 0.75, lime 0.5', 'lime');
R('Painkiller', 'hurricane', 'shake', 1, 'darkrum 2, pineapple 4, oj 1, coconut 1', 'nutmeg, pineapple');
R('Mary Pickford', 'coupe', 'shake', 0, 'rum 2, pineapple 1.5, maraschino 0.25, grenadine 0.25', 'cherry');
R('Blue Hawaiian', 'hurricane', 'blend', 1, 'rum 1, bluecur 1, pineapple 2, coconut 1', 'pineapple, cherry');
R('Jungle Bird', 'rocks', 'shake', 1, 'darkrum 1.5, campari 0.75, pineapple 1.5, lime 0.5, simple 0.5', 'pineapple');
R('Caipirinha', 'rocks', 'build', 1, 'cachaca 2, lime 1, simple 0.75', 'lime');
// Tequila
R('Margarita', 'margarita', 'shake', 1, 'tequila 2, triplesec 1, lime 1', 'saltrim, lime');
R('Frozen Margarita', 'margarita', 'blend', 1, 'tequila 2, triplesec 1, lime 1', 'saltrim, lime');
R("Tommy's Margarita", 'rocks', 'shake', 1, 'tequila 2, lime 1, agave 0.5', 'lime');
R('Tequila Sunrise', 'highball', 'build', 1, 'tequila 1.5, oj 4, grenadine 0.5', 'orange, cherry');
R('Paloma', 'highball', 'build', 1, 'tequila 2, grapefruit 2, lime 0.5, soda 2', 'saltrim, lime');
R('El Diablo', 'highball', 'build', 1, 'tequila 1.5, cassis 0.5, lime 0.5, gingerbeer 3', 'lime');
R('Brave Bull', 'rocks', 'build', 1, 'tequila 1.5, coffee 1');
R('Matador', 'rocks', 'shake', 1, 'tequila 1.5, pineapple 3, lime 0.5', 'lime');
R('Bloody Maria', 'highball', 'build', 1, 'tequila 1.5, tomato 3, lemon 0.5, worcestershire 2, hotsauce 2', 'celery, lime');
R('Mexican Mule', 'mug', 'build', 1, 'tequila 2, gingerbeer 4, lime 0.5', 'lime');
R('Prairie Fire', 'shot', 'build', 0, 'tequila 1.5, hotsauce 3');
// Whiskey
R('Old Fashioned', 'rocks', 'stir', 1, 'bourbon 2, simple 0.25, angostura 2', 'orange, cherry');
R('Manhattan', 'coupe', 'stir', 0, 'rye 2, swvermouth 1, angostura 2', 'cherry');
R('Rob Roy', 'coupe', 'stir', 0, 'scotch 2, swvermouth 1, angostura 2', 'cherry');
R('Whiskey Sour', 'rocks', 'shake', 1, 'bourbon 2, lemon 0.75, simple 0.75', 'orange, cherry');
R('New York Sour', 'rocks', 'shake', 1, 'rye 2, lemon 0.75, simple 0.75, redwine 0.5', 'lemon');
R('Mint Julep', 'rocks', 'build', 1, 'bourbon 2.5, simple 0.5', 'mint');
R('Sazerac', 'rocks', 'stir', 0, 'rye 2, simple 0.25, peychauds 3, absinthe 1', 'lemon');
R('Boulevardier', 'rocks', 'stir', 1, 'bourbon 1.25, campari 1, swvermouth 1', 'orange');
R('Rusty Nail', 'rocks', 'build', 1, 'scotch 1.5, drambuie 0.75', 'lemon');
R('Godfather', 'rocks', 'build', 1, 'scotch 1.5, amaretto 0.75');
R('Irish Coffee', 'irish', 'build', 0, 'irish 1.5, hotcoffee 4, simple 0.5, cream 1');
R('Hot Toddy', 'irish', 'build', 0, 'bourbon 1.5, honey 0.5, lemon 0.5, hotwater 4', 'lemon');
R('Whiskey Ginger', 'highball', 'build', 1, 'irish 1.5, gingerale 4', 'lime');
R('Seven & Seven', 'highball', 'build', 1, 'rye 1.5, lemonlime 4', 'lemon');
R('Scotch & Soda', 'highball', 'build', 1, 'scotch 1.5, soda 4');
R('Gold Rush', 'rocks', 'shake', 1, 'bourbon 2, lemon 0.75, honey 0.75', 'lemon');
R('Brown Derby', 'coupe', 'shake', 0, 'bourbon 1.5, grapefruit 1, honey 0.5');
R('Ward Eight', 'coupe', 'shake', 0, 'rye 2, lemon 0.5, oj 0.5, grenadine 0.25', 'cherry');
R('Lynchburg Lemonade', 'collins', 'build', 1, 'bourbon 1, triplesec 1, lemon 1, lemonlime 4', 'lemon');
R('Kentucky Mule', 'mug', 'build', 1, 'bourbon 2, gingerbeer 4, lime 0.5', 'mint, lime');
R('Vieux Carré', 'rocks', 'stir', 1, 'rye 0.75, brandy 0.75, swvermouth 0.75, benedictine 0.25, angostura 2, peychauds 2', 'lemon');
// Brandy
R('Sidecar', 'coupe', 'shake', 0, 'brandy 1.5, triplesec 0.75, lemon 0.75', 'sugarrim, orange');
R('Brandy Alexander', 'coupe', 'shake', 0, 'brandy 1, cacao 1, cream 1', 'nutmeg');
R('Stinger', 'rocks', 'stir', 1, 'brandy 2, menthe 0.75', 'mint');
R('Between the Sheets', 'coupe', 'shake', 0, 'brandy 1, rum 1, triplesec 1, lemon 0.25', 'lemon');
R('B&B', 'rocks', 'build', 0, 'brandy 1, benedictine 1');
R('Champagne Cocktail', 'flute', 'build', 0, 'simple 0.25, angostura 2, sparkling 4', 'lemon');
// Liqueurs and bubbles
R('Amaretto Sour', 'rocks', 'shake', 1, 'amaretto 1.5, lemon 1, simple 0.5', 'orange, cherry');
R('Grasshopper', 'coupe', 'shake', 0, 'menthe 1, cacao 1, cream 1', 'mint');
R('Golden Cadillac', 'coupe', 'shake', 0, 'galliano 1, cacao 1, cream 1');
R('Toasted Almond', 'rocks', 'shake', 1, 'coffee 1, amaretto 1, cream 1');
R('Midori Sour', 'rocks', 'shake', 1, 'melon 1.5, lemon 1, simple 0.25', 'cherry');
R('Fuzzy Navel', 'highball', 'build', 1, 'peach 1.5, oj 4', 'orange');
R('B-52', 'shot', 'build', 0, 'coffee 0.5, irishcream 0.5, triplesec 0.5');
R('Aperol Spritz', 'wine', 'build', 1, 'aperol 2, sparkling 3, soda 1', 'orange');
R('Hugo Spritz', 'wine', 'build', 1, 'elderflower 1, sparkling 3, soda 1', 'mint, lime');
R('Campari Soda', 'highball', 'build', 1, 'campari 1.5, soda 4', 'orange');
R('Americano', 'rocks', 'build', 1, 'campari 1, swvermouth 1, soda 2', 'orange');
R('Kir Royale', 'flute', 'build', 0, 'cassis 0.5, sparkling 4');
R('Mimosa', 'flute', 'build', 0, 'oj 2, sparkling 3', 'orange');
R('Bellini', 'flute', 'build', 0, 'peachpuree 2, sparkling 4');
// Zero proof
R('Shirley Temple', 'highball', 'build', 1, 'gingerale 6, grenadine 0.5', 'cherry');
R('Roy Rogers', 'highball', 'build', 1, 'cola 6, grenadine 0.5', 'cherry');
R('Virgin Mary', 'highball', 'build', 1, 'tomato 4, lemon 0.5, worcestershire 2, hotsauce 2', 'celery, lemon');
R('Virgin Piña Colada', 'hurricane', 'blend', 1, 'coconut 1.5, pineapple 4', 'pineapple, cherry');

const RECIPE = Object.fromEntries(RECIPES.map(r => [r.name, r]));

// Standard US drinks (0.6 oz of pure alcohol each) in a recipe or a glass's contents.
function standardDrinks(list) {
  let oz = 0;
  for (const { k, a } of list) oz += (ING[k].kind === 'dash' ? a / 32 : a) * ING[k].abv / 100;
  return oz / 0.6;
}
function difficulty(r) { return r.ings.length + r.garnish.length + (r.method === 'build' ? 0 : 1); }
function price(r) { return 8 + 2 * r.ings.filter(i => ING[i.k].abv > 0 && ING[i.k].kind !== 'dash').length; }
