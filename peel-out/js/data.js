// Tables: toppings, the menu, the floor staff, and who you can hire.

// Cart order: front row (nearest you) then back row.
export const TOPPINGS = {
  sauce:     { name: 'Sauce',      short: 'SAUCE',  color: '#b8261b', kind: 'sauce' },
  cheese:    { name: 'Mozzarella', short: 'MOZZ',   color: '#f4ecd2', kind: 'cheese', per: 70 },
  pepperoni: { name: 'Pepperoni',  short: 'PEPP',   color: '#b4301f', kind: 'piece', per: 7 },
  sausage:   { name: 'Sausage',    short: 'SAUS',   color: '#8a5434', kind: 'piece', per: 9 },
  mushroom:  { name: 'Mushroom',   short: 'MUSH',   color: '#cdb795', kind: 'piece', per: 7 },
  pepper:    { name: 'Green pepper', short: 'G.PEP', color: '#3f8a2d', kind: 'piece', per: 7 },
  onion:     { name: 'Red onion',  short: 'ONION',  color: '#b77aa6', kind: 'piece', per: 7 },
  olive:     { name: 'Black olive', short: 'OLIVE', color: '#2a2622', kind: 'piece', per: 9 },
  pineapple: { name: 'Pineapple',  short: 'PINE',   color: '#efc548', kind: 'piece', per: 7 },
  basil:     { name: 'Basil',      short: 'BASIL',  color: '#3c8a3a', kind: 'piece', per: 5 },
};
export const CART = ['sauce', 'cheese', 'pepperoni', 'sausage', 'mushroom', 'pepper', 'onion', 'olive', 'pineapple', 'basil'];
export const BIN_SERVINGS = 8;

export const MENU = [
  { name: 'Cheese',       tops: ['sauce', 'cheese'], price: 13, day: 1 },
  { name: 'Pepperoni',    tops: ['sauce', 'cheese', 'pepperoni'], price: 15, day: 1 },
  { name: 'Margherita',   tops: ['sauce', 'cheese', 'basil'], price: 15, day: 1 },
  { name: 'Meat Lover',   tops: ['sauce', 'cheese', 'pepperoni', 'sausage'], price: 18, day: 2 },
  { name: 'Veggie',       tops: ['sauce', 'cheese', 'mushroom', 'pepper', 'onion'], price: 17, day: 2 },
  { name: 'Hot Hawaiian', tops: ['sauce', 'cheese', 'pepperoni', 'pineapple'], price: 17, day: 3 },
  { name: 'White Pie',    tops: ['cheese', 'mushroom', 'onion'], price: 16, day: 3 },
  { name: 'The Works',    tops: ['sauce', 'cheese', 'pepperoni', 'sausage', 'mushroom', 'pepper', 'onion', 'olive'], price: 22, day: 4 },
];

// Sizes in inches; the dough ball makes a 14" comfortably and tears past ~17".
export const SIZES = [{ label: '10"', in: 10 }, { label: '12"', in: 12 }, { label: '14"', in: 14 }];

export const WAITERS = [
  { name: 'Dot',     shirt: '#2f4858', skin: '#e9b896', hair: '#5a2d1a', apron: '#1c1c1c' },
  { name: 'Sal',     shirt: '#6b2d2d', skin: '#b98260', hair: '#151515', apron: '#efe7d6' },
  { name: 'Frankie', shirt: '#2d5a3d', skin: '#f2c9a8', hair: '#c4732c', apron: '#1c1c1c' },
  { name: 'Bev',     shirt: '#4a3a6b', skin: '#7a4f36', hair: '#1d1410', apron: '#efe7d6' },
];

export const TABLE_LINES = {
  wait: ['Table {t} keeps looking at me.', 'Is {t} up yet?', 'Chef, {t}?', '{t} asked again.', 'Still on {t}?'],
  angry: ['{t} is LEAVING.', 'CHEF. TABLE {t}.', "They're putting coats on.", 'I am getting yelled at.'],
  happy: ['Beautiful!', 'Oh that looks right.', "They're gonna love it.", 'Chef kiss.'],
  meh: ['...it\'s fine.', 'I\'ll tell them it\'s rustic.', 'Close enough.'],
  refuse: ['I can\'t serve this.', 'Absolutely not.', 'That is charcoal.', 'That is still dough.'],
};

// Help you can hire between shifts. Wage is taken from each night's take.
export const HIRES = [
  { id: 'runner', name: 'Dev', role: 'Stock runner', wage: 25, hire: 60, desc: 'Refills empty topping bins and the dough tray from the cooler.' },
  { id: 'dough', name: 'Marco', role: 'Dough cook', wage: 40, hire: 120, desc: 'Stretches a round 14" skin onto the wood peel whenever it is home and empty.' },
  { id: 'oven', name: 'Rosa', role: 'Oven tender', wage: 45, hire: 150, desc: 'Pulls pizzas the moment they are done and slides them onto the pass. Shuts doors you leave open.' },
];
export const UPGRADES = [
  { id: 'oven2', name: 'Fix the second oven', cost: 140, desc: 'Two pies baking at once.' },
  { id: 'bins', name: 'Deep topping bins', cost: 70, desc: 'Bins hold 12 handfuls instead of 8.' },
  { id: 'stone', name: 'Hotter deck stone', cost: 90, desc: 'Bakes 25% faster. Burns 25% faster too.' },
];
