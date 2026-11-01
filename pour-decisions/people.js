// Pour Decisions: the regulars of The Tipsy Comet, and the cartoon faces they wear.

const INK = '#1b1414';

// style: what charms them (listen | joke | compliment). genre: the jukebox music they want.
// tol: standard drinks before they're past the cut-off line.
const PEOPLE = [
  { id: 'orbital', first: 'Orbital', last: 'Ursa', age: 31, style: 'joke', genre: 'synth', tol: 8, state: 'ORBIT',
    look: { bear: true }, favs: ['White Russian', 'Gold Rush', "Bee's Knees", 'Moscow Mule'],
    hi: ['*clomps in, spacesuit squeaking*', 'Back on Earth for the weekend.', 'Gravity is a lot tonight.'],
    chat: ['Six months on the station. You know what you can\'t get in orbit? Honey. Well, you can. It floats away.', 'Mission control says I\'m "not a valid crew member." I fixed the airlock twice!', 'I can see this bar from space. Not really. But I tell people that.'] },
  { id: 'marisol', first: 'Marisol', last: 'Vega', age: 33, style: 'compliment', genre: 'jazz', tol: 4, state: 'EMPIRE',
    look: { skin: '#d9a77c', hair: 'bob', hairColor: '#1d1210', outfit: 'suit', outfitColor: '#2b3a55', acc: ['earrings', 'lipstick'] },
    favs: ['Negroni', 'Boulevardier', 'Aperol Spritz'],
    hi: ['Closed a deal today.', 'Long day on the trading floor.'],
    chat: ['I rebuilt my whole portfolio this week. Not that anyone noticed.', 'New blazer. Italian. You can tell, right?'] },
  { id: 'deke', first: 'Deke', last: 'Fontaine', age: 58, style: 'compliment', genre: 'jazz', tol: 5, state: 'EMPIRE',
    look: { skin: '#8a5a3c', hair: 'short', hairColor: '#cfcfcf', outfit: 'suit', outfitColor: '#5b1f3a', acc: ['mustache', 'fedora', 'bowtie'] },
    favs: ['Manhattan', 'Rob Roy', 'Sidecar'],
    hi: ['Evening, friend.', 'The voice is warmed up.'],
    chat: ['I sang at the Copa in \'89. Standing ovation. Look it up.', 'They want me back on stage Thursday. Should I do it?'] },
  { id: 'priya', first: 'Priya', last: 'Raman', age: 29, style: 'listen', genre: 'synth', tol: 3, state: 'EMPIRE',
    look: { skin: '#b07850', hair: 'ponytail', hairColor: '#120c0a', outfit: 'scrubs', outfitColor: '#3d8d8a', acc: ['glasses'] },
    favs: ['Espresso Martini', 'Gimlet', 'Paloma'],
    hi: ['Thirty-hour shift. Hi.', 'I\'ve been awake since Tuesday.'],
    chat: ['We lost a patient tonight. I keep thinking about it.', 'My attending yelled at me in front of everyone. Again.'] },
  { id: 'sal', first: 'Sal', last: 'Russo', age: 51, style: 'joke', genre: 'rock', tol: 6, state: 'GARDEN',
    look: { skin: '#e7b993', hair: 'bald', hairColor: '#4b3a2f', outfit: 'jacket', outfitColor: '#c69a2a', acc: ['mustache', 'cap'] },
    favs: ['Old Fashioned', 'Rum & Coke', 'Whiskey Sour'],
    hi: ['Twelve hours in the cab. Twelve!', 'Some guy left a parrot in my back seat.'],
    chat: ['Fare today asked me to "follow that car." I\'ve waited thirty years for that.', 'You know how many potholes on Delancey? I named them.'] },
  { id: 'tiffani', first: 'Tiffani', last: 'Glass', age: 24, style: 'compliment', genre: 'disco', tol: 3, state: 'EMPIRE',
    look: { skin: '#f2d0b6', hair: 'long', hairColor: '#f2d36b', outfit: 'dress', outfitColor: '#e85ca8', acc: ['earrings', 'lipstick', 'lashes'] },
    favs: ['Cosmopolitan', 'Lemon Drop', 'Mimosa', 'Sex on the Beach'],
    hi: ['Hiii! Is the lighting good over here?', 'Omg, cute bar.'],
    chat: ['I got 40k views on my latte video. Do you think my nails are too much?', 'New hair. Be honest. Actually don\'t.'] },
  { id: 'kevin', first: 'Kevin', last: 'Pham', age: 19, style: 'joke', genre: 'rock', tol: 2, state: 'EMPIRE', underage: true,
    look: { skin: '#e8c39e', hair: 'spiky', hairColor: '#151515', outfit: 'hoodie', outfitColor: '#6a2fa0', acc: [] },
    alias: { first: 'Kenny', age: 24, look: { skin: '#e8c39e', hair: 'short', hairColor: '#151515', outfit: 'tee', outfitColor: '#333', acc: ['glasses'] } },
    favs: ['Long Island Iced Tea', 'Screwdriver', 'Rum & Coke'],
    hi: ['Sup. I\'m, uh, totally from around here.', 'Just finished a long day at my... job.'],
    chat: ['My midterms are— I mean my taxes are due.', 'I\'m basically 25 in dog years.'] },
  { id: 'brooke', first: 'Brooke', last: 'Lindqvist', age: 20, style: 'compliment', genre: 'disco', tol: 2, state: 'KEYSTONE', underage: true, almost: true,
    look: { skin: '#f4d6c4', hair: 'bun', hairColor: '#b5651d', outfit: 'tee', outfitColor: '#3fae8a', acc: ['earrings'] },
    alias: { first: 'Annika', age: 25, look: { skin: '#f4d6c4', hair: 'long', hairColor: '#e8c37a', outfit: 'tee', outfitColor: '#555', acc: ['earrings'] } },
    favs: ['Fuzzy Navel', 'Margarita', 'Woo Woo'],
    hi: ['It\'s basically my birthday!', 'My friends are meeting me here.'],
    chat: ['I just cut my bangs myself. Do they look okay?', 'I wore my lucky shirt tonight.'] },
  { id: 'gus', first: 'Gus', last: 'Whitaker', age: 67, style: 'listen', genre: 'rock', tol: 5, state: 'EMPIRE',
    look: { skin: '#e3b28f', hair: 'buzz', hairColor: '#d8d8d8', outfit: 'jacket', outfitColor: '#30475e', acc: ['mustache'] },
    favs: ['Seven & Seven', 'Rusty Nail', 'Scotch & Soda', 'Manhattan'],
    hi: ['Thirty-one years on the force, and this is still my beat.', 'Quiet night?'],
    chat: ['My wife used to sit right there. Eleven years now.', 'My kid doesn\'t call much since he moved to Denver.'] },
  { id: 'lola', first: 'Lola', last: 'Ortiz', age: 28, style: 'joke', genre: 'rock', tol: 5, state: 'EMPIRE',
    look: { skin: '#c48a62', hair: 'mohawk', hairColor: '#e0367a', outfit: 'jersey', outfitColor: '#222', acc: ['earrings', 'choker'] },
    favs: ['Margarita', 'Tequila Sunrise', 'El Diablo', 'Paloma'],
    hi: ['Won the bout! Mostly bruises.', 'Derby practice ran long.'],
    chat: ['I knocked a girl into the snack table tonight. Clean hit.', 'My derby name is "Lola Thunder." I wanted "Brick Spears" but it was taken.'] },
  { id: 'ambrose', first: 'Ambrose', last: 'Quill', age: 72, style: 'listen', genre: 'jazz', tol: 4, state: 'NUTMEG',
    look: { skin: '#f0cfb4', hair: 'bald', hairColor: '#eeeeee', outfit: 'sweater', outfitColor: '#7a5a3a', acc: ['glasses', 'beard', 'bowtie'] },
    favs: ['Sazerac', 'Vieux Carré', 'Brandy Alexander', 'Last Word'],
    hi: ['Ah. A port in the storm.', 'Good evening.'],
    chat: ['I retire after this semester. Forty years teaching Melville.', 'My last student turned in a paper written by a chatbot. About Moby-Dick.'] },
  { id: 'jojo', first: 'Jojo', last: 'Mercer', age: 18, style: 'joke', genre: 'synth', tol: 2, state: 'EMPIRE', underage: true, fakeOnly: true,
    look: { skin: '#f6dccb', hair: 'curly', hairColor: '#2a7de0', outfit: 'hoodie', outfitColor: '#f0a21a', acc: ['headphones'] },
    favs: ['Blue Lagoon', 'Electric Lemonade', 'Adios'],
    hi: ['Yo. Totally of age. Want proof? I have proof.', 'Hey, um, grown-up drink please.'],
    chat: ['I skated here from Bushwick. In this economy.', 'I make beats. You\'ve probably never heard them. Nobody has.'] },
  { id: 'nadia', first: 'Nadia', last: 'Volkova', age: 41, style: 'listen', genre: 'jazz', tol: 6, state: 'EMPIRE',
    look: { skin: '#f3dccd', hair: 'long', hairColor: '#111', outfit: 'turtleneck', outfitColor: '#111', acc: ['lipstick'] },
    favs: ['Black Russian', 'Vodka Martini', 'Vesper'],
    hi: ['Washington Square was cold tonight.', 'I beat a tourist in eleven moves.'],
    chat: ['I was a grandmaster at sixteen. Now I hustle chess in the park.', 'My brother still won\'t speak to me. Twelve years.'] },
  { id: 'barnacle', first: 'Bart', last: 'Hayes', age: 60, style: 'joke', genre: 'rock', tol: 7, state: 'GARDEN',
    look: { skin: '#d79a76', hair: 'short', hairColor: '#e9e4d8', outfit: 'peacoat', outfitColor: '#1f3554', acc: ['beard', 'beanie'] },
    favs: ["Dark 'n' Stormy", 'Mai Tai', 'Painkiller', "Planter's Punch"],
    hi: ['Ahoy. Tug\'s tied up for the night.', 'Choppy on the East River.'],
    chat: ['Pulled a barge past the Statue of Liberty today. She waved. Probably.', 'A seagull stole my sandwich. Third time this week.'] },
  { id: 'wendell', first: 'Wendell', last: 'Fisk', age: 38, style: 'listen', genre: 'jazz', tol: 3, state: 'EMPIRE',
    look: { skin: '#f1c9a8', hair: 'short', hairColor: '#6b4a2b', outfit: 'shirt', outfitColor: '#d8e3ec', acc: ['glasses', 'tie'] },
    favs: ['Tom Collins', 'Gin & Tonic', 'Gin Fizz'],
    hi: ['Hello. Is this seat... okay. Thank you.', 'Hi. Sorry.'],
    chat: ['I got passed over for promotion again. By the intern.', 'My cat doesn\'t seem to like me very much.'] },
  { id: 'zara', first: 'Zara', last: 'Okafor', age: 35, style: 'compliment', genre: 'disco', tol: 4, state: 'EMPIRE',
    look: { skin: '#6b4026', hair: 'afro', hairColor: '#1a1010', outfit: 'dress', outfitColor: '#f2c230', acc: ['earrings', 'lipstick'] },
    favs: ['French 75', 'Kir Royale', 'Bellini', 'Hugo Spritz'],
    hi: ['Fashion Week is killing me, darling.', 'Hello, gorgeous bar.'],
    chat: ['I made this dress on the subway this morning.', 'Vogue wants to profile me. I said maybe.'] },
  { id: 'mofi', first: 'Maurice', last: 'Fields', age: 30, style: 'joke', genre: 'synth', tol: 5, state: 'EMPIRE',
    look: { skin: '#5a3624', hair: 'buzz', hairColor: '#111', outfit: 'tee', outfitColor: '#1fd1c4', acc: ['headphones', 'glasses'] },
    favs: ['Long Island Iced Tea', 'Adios', 'Midori Sour', 'Melon Ball'],
    hi: ['DJ Mo-Fi in the house. Off duty.', 'Just played a warehouse in Ridgewood.'],
    chat: ['The crowd tonight requested the Macarena. Nine times.', 'I dropped my laptop in the punch bowl. Still played the set.'] },
  { id: 'edie', first: 'Edie', last: 'Rosenblum', age: 82, style: 'joke', genre: 'jazz', tol: 3, state: 'EMPIRE',
    look: { skin: '#f3d8c6', hair: 'curly', hairColor: '#e6e6f2', outfit: 'cardigan', outfitColor: '#c76b8e', acc: ['glasses', 'earrings', 'lipstick'] },
    favs: ['Martini', 'Gibson', 'Grasshopper', 'Golden Cadillac'],
    hi: ['Don\'t tell my grandson I\'m here.', 'Mahjong ran late, sweetheart.'],
    chat: ['I\'ve buried two husbands. Well, one. The other one\'s in Boca.', 'My doctor says I should cut back. I\'ve outlived three doctors.'] },
  { id: 'theo', first: 'Theo', last: 'Banks', age: 26, style: 'compliment', genre: 'disco', tol: 3, state: 'NUTMEG',
    look: { skin: '#9b6a4a', hair: 'curly', hairColor: '#2a1a12', outfit: 'vest', outfitColor: '#2f7a4a', acc: ['earrings'] },
    favs: ['Sidecar', "Bee's Knees", 'Champagne Cocktail', 'Amaretto Sour'],
    hi: ['Just got out of the show! Understudy life.', 'Five shows this week.'],
    chat: ['I went on for the lead tonight! The audience didn\'t even boo.', 'I\'ve been practicing my high C. Want to hear it? No? Fair.'] },
  { id: 'ruby', first: 'Ruby', last: 'Tran', age: 31, style: 'listen', genre: 'rock', tol: 5, state: 'EMPIRE',
    look: { skin: '#edc9a3', hair: 'long', hairColor: '#b0152a', outfit: 'tank', outfitColor: '#222', acc: ['bandana', 'earrings', 'choker'] },
    favs: ['Paloma', 'Caipirinha', 'Jungle Bird', "Tommy's Margarita"],
    hi: ['Six hours on one back piece.', 'Hand cramp. Need a drink.'],
    chat: ['A guy wanted his ex\'s name tattooed. I talked him out of it. He cried.', 'My shop might close. Rent\'s going up again.'] },
  { id: 'hank', first: 'Hank', last: 'Hennessey', age: 45, style: 'compliment', genre: 'disco', tol: 6, state: 'SUNSHINE',
    look: { skin: '#e2a982', hair: 'short', hairColor: '#e2b44a', outfit: 'jacket', outfitColor: '#a2382c', acc: [] },
    favs: ['Mai Tai', 'Hurricane', 'Piña Colada', 'Kentucky Mule'],
    hi: ['Fell off a building today. On purpose.', 'Stunt double, reporting for drinks.'],
    chat: ['I did the motorcycle jump in that big movie. You didn\'t see my face, but that was me.', 'Check out these arms. Fourteen takes of hanging off a helicopter.'] },
];

const STATES = {
  EMPIRE: { name: 'EMPIRE STATE', tag: 'DRIVER LICENSE', color: '#2f5fa7', city: ['Brooklyn, NY', 'Manhattan, NY', 'Queens, NY', 'Bronx, NY'] },
  GARDEN: { name: 'GARDEN STATE', tag: 'DRIVER LICENSE', color: '#2f8a4a', city: ['Hoboken, NJ', 'Jersey City, NJ', 'Newark, NJ'] },
  KEYSTONE: { name: 'KEYSTONE STATE', tag: 'IDENTIFICATION CARD', color: '#3a3a8c', city: ['Philadelphia, PA', 'Scranton, PA'] },
  NUTMEG: { name: 'NUTMEG STATE', tag: 'DRIVER LICENSE', color: '#6b3fa0', city: ['New Haven, CT', 'Stamford, CT'] },
  SUNSHINE: { name: 'SUNSHINE STATE', tag: 'DRIVER LICENSE', color: '#d9781c', city: ['Miami, FL', 'Tampa, FL'] },
  ORBIT: { name: 'LOW EARTH ORBIT', tag: 'CREW IDENTIFICATION', color: '#1d2a4a', city: ['Module 3, Station Alpha'] },
};
// Typos that give a bad fake away.
const TYPOS = { EMPIRE: 'EMPIRE STAET', GARDEN: 'GARDEN SATE', KEYSTONE: 'KEYSTOEN STATE', NUTMEG: 'NUTMEG STAT', SUNSHINE: 'SUNSHNIE STATE', ORBIT: 'LOW EARHT ORBIT' };

// ---------- Faces ----------
// face(look, {mood:'neutral'|'happy'|'angry'|'sad', drunk:0..3}) -> SVG string, 200x230 box.
function face(look, o = {}) {
  const mood = o.mood || 'neutral', drunk = o.drunk || 0;
  const body = look.bear ? bearBody(look, mood, drunk) : humanBody(look, mood, drunk);
  return `<svg viewBox="0 0 200 230" xmlns="http://www.w3.org/2000/svg" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

function eyes(drunk, mood, skin, y = 98, dx = 18, r = 9) {
  let s = '';
  for (const x of [100 - dx, 100 + dx]) {
    s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r + 1}" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
    const px = x + (mood === 'angry' ? 0 : 1), py = y + (drunk >= 2 ? 3 : 1);
    s += `<circle cx="${px}" cy="${py}" r="${r * .5}" fill="${INK}"/><circle cx="${px + 1.5}" cy="${py - 2}" r="1.4" fill="#fff"/>`;
    if (drunk >= 2) s += `<path d="M${x - r - 1},${y + (drunk >= 3 ? 2 : -1)} A${r + 1},${r + 1} 0 0 1 ${x + r + 1},${y + (drunk >= 3 ? 2 : -1)} Z" fill="${skin}" stroke="${INK}" stroke-width="3"/>`;
  }
  return s;
}
function brows(mood, color, y = 82, dx = 18) {
  const tilt = mood === 'angry' ? 5 : mood === 'sad' ? -4 : 0;
  return [[100 - dx, 1], [100 + dx, -1]].map(([x, side]) =>
    `<path d="M${x - 9},${y - tilt * side} L${x + 9},${y + tilt * side}" stroke="${color}" stroke-width="4.5" fill="none"/>`).join('');
}
function mouth(mood, drunk, color, y = 134) {
  if (drunk >= 3) return `<path d="M86,${y} Q100,${y + 16} 116,${y - 2}" stroke="${color}" stroke-width="4" fill="none"/>`;
  if (mood === 'happy') return `<path d="M84,${y - 2} Q100,${y + 16} 116,${y - 2} Z" fill="#7a1c1c" stroke="${color}" stroke-width="3.5"/>`;
  if (mood === 'angry' || mood === 'sad') return `<path d="M88,${y + 6} Q100,${y - 4} 112,${y + 6}" stroke="${color}" stroke-width="4" fill="none"/>`;
  return `<path d="M89,${y + 1} Q100,${y + 5} 111,${y + 1}" stroke="${color}" stroke-width="4" fill="none"/>`;
}
function blush(drunk, y = 120) {
  if (!drunk) return '';
  const op = [0, .25, .5, .75][drunk];
  return `<ellipse cx="72" cy="${y}" rx="10" ry="6" fill="#ff4d5e" opacity="${op}"/><ellipse cx="128" cy="${y}" rx="10" ry="6" fill="#ff4d5e" opacity="${op}"/>`;
}

function humanBody(L, mood, drunk) {
  const S = `stroke="${INK}" stroke-width="4"`, hc = L.hairColor, acc = new Set(L.acc || []);
  let s = '';
  // hair that falls behind the head
  if (L.hair === 'long') s += `<path d="M46,96 C38,28 162,28 154,96 L160,196 Q100,206 40,196 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'bob') s += `<path d="M46,96 C40,30 160,30 154,96 L156,150 Q100,160 44,150 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'ponytail') s += `<path d="M140,70 C178,80 176,150 158,176 C162,140 150,110 136,94 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'afro') s += `<circle cx="100" cy="78" r="70" fill="${hc}" ${S}/>`;
  if (L.hair === 'curly') for (const [x, y] of [[54, 90], [60, 60], [80, 42], [100, 36], [120, 42], [140, 60], [146, 90]]) s += `<circle cx="${x}" cy="${y}" r="20" fill="${hc}" ${S}/>`;
  // torso
  s += outfit(L, S);
  // neck and head
  s += `<path d="M84,138 L84,176 Q100,184 116,176 L116,138 Z" fill="${L.skin}" ${S}/>`;
  if (acc.has('choker')) s += `<rect x="83" y="160" width="34" height="7" rx="3" fill="${INK}"/>`;
  s += `<ellipse cx="54" cy="104" rx="8" ry="12" fill="${L.skin}" ${S}/><ellipse cx="146" cy="104" rx="8" ry="12" fill="${L.skin}" ${S}/>`;
  s += `<ellipse cx="100" cy="100" rx="46" ry="54" fill="${L.skin}" ${S}/>`;
  if (acc.has('earrings')) s += `<circle cx="52" cy="122" r="5" fill="#f2c230" ${S.replace('4', '2')}/><circle cx="148" cy="122" r="5" fill="#f2c230" ${S.replace('4', '2')}/>`;
  if (acc.has('beard')) s += `<path d="M56,104 C56,176 144,176 144,104 C138,150 62,150 56,104 Z" fill="${hc}" ${S}/>`;
  // hair on top
  const cap = `M54,100 C46,34 154,34 146,100 C142,76 128,62 100,62 C72,62 58,76 54,100 Z`;
  if (['short', 'long', 'ponytail', 'bob'].includes(L.hair)) s += `<path d="${cap}" fill="${hc}" ${S}/>`;
  if (L.hair === 'bob') s += `<path d="M56,84 C58,46 142,46 144,84 L144,88 L56,88 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'long') s += `<path d="M100,60 C80,70 70,80 62,100" stroke="${INK}" stroke-width="3" fill="none"/>`;
  if (L.hair === 'bun') s += `<circle cx="100" cy="40" r="20" fill="${hc}" ${S}/><path d="${cap}" fill="${hc}" ${S}/>`;
  if (L.hair === 'buzz') s += `<path d="${cap}" fill="${hc}" opacity=".85" ${S}/>`;
  if (L.hair === 'spiky') s += `<path d="M54,100 L50,56 L66,66 L70,36 L86,56 L98,28 L110,54 L126,34 L132,62 L150,52 L146,100 C140,78 124,66 100,66 C76,66 60,78 54,100 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'mohawk') s += `<path d="M88,62 L84,26 L96,38 L100,18 L106,38 L118,26 L112,62 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'curly') for (const [x, y] of [[70, 58], [92, 48], [114, 50], [134, 64]]) s += `<circle cx="${x}" cy="${y}" r="14" fill="${hc}" ${S}/>`;
  if (L.hair === 'afro') s += `<path d="M56,92 C56,40 144,40 144,92 C130,70 70,70 56,92 Z" fill="${hc}" ${S}/>`;
  if (L.hair === 'bald') s += `<path d="M56,96 C54,82 60,76 64,74 M144,96 C146,82 140,76 136,74" stroke="${hc}" stroke-width="8" fill="none"/>`;
  // headwear
  if (acc.has('bandana')) s += `<path d="M54,78 C70,58 130,58 146,78 L146,90 C130,72 70,72 54,90 Z" fill="#c42a2a" ${S}/>`;
  if (acc.has('beanie')) s += `<path d="M50,84 C48,26 152,26 150,84 Z" fill="#c03a2b" ${S}/><rect x="48" y="74" width="104" height="16" rx="6" fill="#9a2a1e" ${S}/>`;
  if (acc.has('cap')) s += `<path d="M54,80 C54,34 146,34 146,80 Z" fill="#2f5fa7" ${S}/><path d="M54,80 L28,86 Q40,74 60,74" fill="#2f5fa7" ${S}/>`;
  if (acc.has('fedora')) s += `<ellipse cx="100" cy="66" rx="70" ry="13" fill="#2b2b2b" ${S}/><path d="M64,66 C62,22 138,22 136,66 Z" fill="#2b2b2b" ${S}/><rect x="64" y="52" width="72" height="9" fill="#8a1c2c"/>`;
  if (acc.has('headphones')) s += `<path d="M48,104 C40,24 160,24 152,104" stroke="${INK}" stroke-width="7" fill="none"/><rect x="38" y="90" width="18" height="30" rx="7" fill="#e23b5a" ${S}/><rect x="144" y="90" width="18" height="30" rx="7" fill="#e23b5a" ${S}/>`;
  // face
  s += brows(mood, hc === '#e6e6f2' ? '#8a8a96' : INK);
  s += eyes(drunk, mood, L.skin);
  if (acc.has('lashes')) s += `<path d="M72,88 L68,84 M78,86 L76,81 M122,86 L124,81 M128,88 L132,84" stroke="${INK}" stroke-width="3"/>`;
  s += `<path d="M100,104 Q93,118 101,121" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
  s += blush(drunk);
  if (acc.has('mustache')) s += `<path d="M80,128 Q100,114 120,128 Q110,132 100,126 Q90,132 80,128 Z" fill="${hc}" ${S.replace('4', '2.5')}/>`;
  s += mouth(mood, drunk, acc.has('lipstick') ? '#8e1030' : INK);
  if (acc.has('glasses')) s += `<g fill="rgba(255,255,255,.18)" stroke="${INK}" stroke-width="3.5"><circle cx="82" cy="98" r="14"/><circle cx="118" cy="98" r="14"/><path d="M96,97 L104,97 M68,96 L56,92 M132,96 L144,92" fill="none"/></g>`;
  return s;
}

function outfit(L, S) {
  const c = L.outfitColor, acc = new Set(L.acc || []);
  let s = `<path d="M18,232 C22,186 56,170 100,170 C144,170 178,186 182,232 Z" fill="${c}" ${S}/>`;
  switch (L.outfit) {
    case 'suit': case 'jacket': case 'peacoat': case 'vest':
      s += `<path d="M86,172 L100,232 L114,172" fill="${L.outfit === 'vest' ? '#f4efe4' : '#f4efe4'}" ${S}/><path d="M80,172 L96,206 L86,214 Z M120,172 L104,206 L114,214 Z" fill="${c}" ${S}/>`;
      if (L.outfit === 'peacoat') s += `<circle cx="74" cy="206" r="4" fill="#d8c27a"/><circle cx="126" cy="206" r="4" fill="#d8c27a"/>`;
      break;
    case 'shirt':
      s += `<path d="M84,172 L100,190 L116,172" fill="none" ${S}/>`; break;
    case 'turtleneck': case 'sweater': case 'cardigan':
      s += `<path d="M80,170 Q100,184 120,170 L120,160 Q100,170 80,160 Z" fill="${c}" ${S}/>`;
      if (L.outfit === 'cardigan') s += `<path d="M100,178 L100,232" stroke="${INK}" stroke-width="3"/><circle cx="106" cy="196" r="3" fill="${INK}"/><circle cx="106" cy="214" r="3" fill="${INK}"/>`;
      break;
    case 'dress': case 'tank':
      s += `<path d="M30,232 C34,200 60,190 64,182 L76,232 Z M170,232 C166,200 140,190 136,182 L124,232 Z" fill="${L.skin}" stroke="none"/><path d="M68,182 L66,206 M132,182 L134,206" stroke="${INK}" stroke-width="3"/>`;
      break;
    case 'hoodie':
      s += `<path d="M60,176 Q100,200 140,176" fill="none" ${S}/><path d="M90,190 L88,214 M110,190 L112,214" stroke="${INK}" stroke-width="3"/>`; break;
    case 'scrubs':
      s += `<path d="M84,172 L100,198 L116,172" fill="none" ${S}/><rect x="122" y="196" width="22" height="16" fill="none" stroke="${INK}" stroke-width="3"/>`; break;
    case 'jersey':
      s += `<text x="100" y="222" text-anchor="middle" font-family="Bangers,Impact,sans-serif" font-size="30" fill="#e0367a" stroke="${INK}" stroke-width="1.5">13</text>`; break;
    default: // tee
      s += `<path d="M82,172 Q100,186 118,172" fill="none" ${S}/>`;
  }
  if (acc.has('tie')) s += `<path d="M96,178 L104,178 L106,186 L100,226 L94,186 Z" fill="#b5283a" ${S.replace('4', '3')}/>`;
  if (acc.has('bowtie')) s += `<path d="M100,178 L84,170 L84,188 Z M100,178 L116,170 L116,188 Z" fill="#b5283a" ${S.replace('4', '3')}/><circle cx="100" cy="178" r="4" fill="#b5283a" stroke="${INK}" stroke-width="2"/>`;
  return s;
}

// Orbital: a scruffy grizzly head poking out of a bulky white spacesuit.
function bearBody(L, mood, drunk) {
  const S = `stroke="${INK}" stroke-width="4"`, fur = '#8b5e34', furD = '#6a4423', muz = '#c99a68';
  let s = '';
  // suit: puffy shoulders, quilted seams, neck ring
  s += `<path d="M6,232 C4,186 34,160 70,158 L130,158 C166,160 196,186 194,232 Z" fill="#f4f4f0" ${S}/>`;
  s += `<path d="M40,190 C50,200 52,220 48,232 M160,190 C150,200 148,220 152,232 M76,196 L76,232 M124,196 L124,232" stroke="#b9bcc2" stroke-width="3" fill="none"/>`;
  s += `<g transform="translate(150 182) rotate(-12)"><rect x="0" y="0" width="30" height="16" fill="#fff" stroke="${INK}" stroke-width="2.5"/>${[0, 1, 2].map(i => `<rect x="${i * 10 + 1}" y="1" width="5" height="14" fill="#d12a2a"/>`).join('')}</g>`;
  s += `<circle cx="34" cy="206" r="13" fill="#1d2a6a" stroke="${INK}" stroke-width="3"/><circle cx="34" cy="206" r="6" fill="#f2c230"/><path d="M20,210 Q34,198 48,204" stroke="#e23b3b" stroke-width="2.5" fill="none"/>`;
  s += `<ellipse cx="100" cy="168" rx="56" ry="18" fill="#c8ccd2" ${S}/><ellipse cx="100" cy="166" rx="44" ry="11" fill="#9aa0a8" stroke="${INK}" stroke-width="3"/>`;
  // head
  s += `<circle cx="54" cy="52" r="20" fill="${fur}" ${S}/><circle cx="54" cy="54" r="10" fill="${furD}"/>`;
  s += `<circle cx="146" cy="52" r="20" fill="${fur}" ${S}/><circle cx="146" cy="54" r="10" fill="${furD}"/>`;
  s += `<path d="M48,108 C40,58 70,40 100,40 C130,40 160,58 152,108 C150,140 128,166 100,166 C72,166 50,140 48,108 Z" fill="${fur}" ${S}/>`;
  // scruffy fur tufts
  s += `<path d="M52,120 L42,126 L54,130 M148,120 L158,126 L146,130 M86,42 L92,34 L98,42 M102,42 L110,34 L114,44" stroke="${INK}" stroke-width="3" fill="${fur}"/>`;
  s += `<path d="M64,80 Q70,74 76,80 M124,80 Q130,74 136,80" stroke="${furD}" stroke-width="3" fill="none"/>`;
  // eyes
  const lid = drunk >= 2;
  for (const x of [80, 120]) {
    s += `<circle cx="${x}" cy="94" r="6.5" fill="${INK}"/><circle cx="${x + 2}" cy="92" r="2" fill="#fff"/>`;
    if (lid) s += `<path d="M${x - 8},${drunk >= 3 ? 95 : 92} A8,8 0 0 1 ${x + 8},${drunk >= 3 ? 95 : 92} Z" fill="${fur}" stroke="${INK}" stroke-width="2.5"/>`;
  }
  const b = mood === 'angry' ? 5 : mood === 'sad' ? -4 : 0;
  s += `<path d="M72,${82 - b} L88,${82 + b} M128,${82 - b} L112,${82 + b}" stroke="${furD}" stroke-width="5"/>`;
  // muzzle
  s += `<ellipse cx="100" cy="126" rx="30" ry="24" fill="${muz}" ${S}/>`;
  s += `<path d="M88,110 Q100,102 112,110 Q112,120 100,122 Q88,120 88,110 Z" fill="${INK}"/><ellipse cx="96" cy="108" rx="4" ry="2" fill="#fff" opacity=".7"/>`;
  s += blush(drunk, 116).replace(/cx="72"/, 'cx="66"').replace(/cx="128"/, 'cx="134"');
  if (mood === 'happy' || drunk >= 3) s += `<path d="M82,132 Q100,152 118,132 Q100,140 82,132 Z" fill="#7a1c1c" stroke="${INK}" stroke-width="3"/><path d="M92,134 L94,140 M108,134 L106,140" stroke="#fff" stroke-width="3"/>`;
  else if (mood === 'angry' || mood === 'sad') s += `<path d="M86,142 Q100,130 114,142" stroke="${INK}" stroke-width="4" fill="none"/>`;
  else s += `<path d="M100,122 L100,132 M86,134 Q100,142 114,134" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
  return s;
}
