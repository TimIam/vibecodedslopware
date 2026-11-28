// The album, in order: skits are cinema scenes, songs are stages. All dialogue here is written
// for the game; it retells the record's story (a rebel MC in the year 3030 takes music back from
// the corporations that banned it) without quoting its lyrics.

export const CINES = {
  open: {
    track: 1, title: 'State of the Nation', song: 'title',
    shots: [
      { bg: 'bank', speaker: '', lines: ['The year is three thousand and thirty.'] },
      { bg: 'bank', speaker: '', lines: ['Over the old fairgrounds stands the Corporate Institutional Bank of Time.', 'It holds every hour anyone ever lived, and lends them back at interest.'] },
      { bg: 'vault', speaker: '', lines: ['Music was the first thing it repossessed.', 'Rhymes are contraband now. A drum loop is a felony.'] },
      { bg: 'sunset', speaker: '', lines: ['But something keeps leaking through the static. A signal that sounds like it has been here before.'] },
    ],
  },
  escape: {
    song: 'title',
    shots: [
      { bg: 'mars', speaker: 'RADIO', col: '#3fd0d8', fx: 'flash', lines: ['RELAY NINE TO GROUND. TOUCHDOWN ON THE RED PLANET. EVERY BOARD IS GREEN.', 'GROUND, DO YOU READ? ...GROUND?'] },
      { bg: 'prison', speaker: '', lines: ['Meanwhile, in a cell under the Bank: prisoner Zero.', 'Ex-mech soldier. Discharged for refusing orders. Jailed for his verses.'] },
      { bg: 'speed', who: 'deltron', o: { cols: ['#17142b', '#221f4a', '#352f73', '#5a3f9e'], line: '#3fd0d8', cx: 60 }, lines: ['They called my rhymes a weapon. Handed me a sentence for every sentence.'] },
      { eyes: true, who: 'deltron', lines: ['Funny thing about a cell. It is just a room with a beat nobody has found yet.'] },
      { bg: 'prison', o: { portal: true }, fx: 'flash', speaker: '', lines: ['The back wall tears open into a portal. Outside, a parked security mech sits idling.'] },
      { bg: 'city', o: { mech: true }, who: 'deltron', side: 'R', lines: ['A planet-wide manhunt? Good. I like an audience.', 'Next stop: the Automator\'s lab.'] },
    ],
  },
  fantabulous: {
    track: 3, title: 'The Fantabulous Rap Extravaganza', song: 'fantabulous',
    shots: [
      { bg: 'arena', o: { flashy: true }, speaker: 'ANNOUNCER', fx: 'flash', lines: ['LADIES! GENTLEMEN! BIOFORMS OF EVERY PERSUASION!'] },
      { bg: 'speed', who: 'announcer', o: { cx: 60 }, lines: ['Live from low orbit, it is the FANTABULOUS RAP EXTRAVAGANZA!'] },
      { bg: 'arena', speaker: 'ANNOUNCER', lines: ['Presented by the Galactic Rhyme Federation: the only league in the galaxy still licensed to rhyme!'] },
      { bg: 'grad', who: 'announcer', side: 'R', lines: ['Our champion has not lost a battle in four hundred years.', 'Any challengers? Anyone? Ha! Ha! Ha!'] },
    ],
  },
  lab: {
    song: 'things',
    shots: [
      { bg: 'lab', who: 'automator', side: 'R', lines: ['Deltron Zero. You parked a stolen mech in my lab. Again.'] },
      { bg: 'lab', who: 'deltron', lines: ['Saw the Extravaganza on the jail TV. I want that title.'] },
      { bg: 'grad', who: 'automator', side: 'R', o: { cols: ['#0b0a14', '#1d6f7a', '#3fd0d8'] }, lines: ['Then the whole galaxy has to hear you. Which means calibration first.', 'Show me the things you can do.'] },
    ],
  },
  decks: {
    song: 'contact',
    shots: [
      { bg: 'lab', who: 'automator', side: 'R', lines: ['Meet the DJ. Fastest hands this side of Neptune.'] },
      { bg: 'speed', who: 'dj', o: { cols: ['#0b0a14', '#1f5a3a', '#3fae5a', '#a6e34d'], cx: 60 }, lines: ['There is an underground out there. Rebels, poets, a choir of whales under the ice on Europa.', 'They just need a sign. I cut the signal, you keep the needle honest.'] },
      { bg: 'lab', who: 'deltron', lines: ['Then let us make some positive contact.'] },
    ],
  },
  stcath: {
    track: 6, title: 'St. Catherine St.', song: 'stcath',
    shots: [
      { bg: 'street', speaker: '', lines: ['St. Catherine Street, past midnight. The snow is neon and radios are illegal.'] },
      { bg: 'street', speaker: 'PASSERBY', col: '#ff8fc7', lines: ['Hey. Hey! Somebody is scratching on the emergency band.'] },
      { bg: 'street', speaker: 'OTHER PASSERBY', col: '#a6e34d', lines: ['Turn it up. No. Turn it UP.'] },
      { bg: 'lab', who: 'automator', side: 'R', lines: ['They heard you. Now we make the Bank\'s network hear something it can\'t forget.', 'I wrote you a virus. Slide it through their servers, one packet at a time.'] },
    ],
  },
  brymar: {
    song: 'upgrade',
    shots: [
      { bg: 'college', who: 'professor', side: 'R', lines: ['Welcome to Brymar College. Upgrade 101. Phones away, brains out.'] },
      { bg: 'college', who: 'professor', side: 'R', lines: ['Every implant in this city is wired for obedience. Today we rewire yours for rhythm.'] },
      { bg: 'college', who: 'deltron', lines: ['Is there a test?'] },
      { bg: 'college', who: 'professor', side: 'R', lines: ['There is always a test.'] },
    ],
  },
  newcoke: {
    track: 9, title: 'New Coke', song: 'newcoke',
    shots: [
      { bg: 'tv', o: { show: 'ad' }, speaker: 'TV', col: '#ff8fc7', lines: ['Thirsty for tomorrow? Introducing NEW.'] },
      { bg: 'tv', o: { show: 'ad' }, speaker: 'TV', col: '#ff8fc7', lines: ['It is new! It is improved! It contains forty percent more future and absolutely no memories!'] },
      { bg: 'tv', o: { show: 'ad' }, speaker: 'TV', col: '#ff8fc7', lines: ['NEW. A product of the Bank of Time. Drink responsibly, then forget.'] },
    ],
  },
  vaultplan: {
    song: 'mastermind',
    shots: [
      { bg: 'grad', who: 'banker', side: 'R', o: { cols: ['#0b0a14', '#2a0610', '#7a1426'] }, lines: ['So the noise-maker wants his music back.'] },
      { bg: 'vault', who: 'banker', side: 'R', lines: ['Every song ever recorded is in my vault, behind a code no mind can crack.'] },
      { bg: 'speed', who: 'deltron', o: { cx: 60 }, lines: ['Lucky for me I am not just a mind. I am a mastermind.'] },
    ],
  },
  review: {
    track: 11, title: 'National Movie Review', song: 'review',
    shots: [
      { bg: 'tv', o: { show: 'review' }, speaker: 'THE CRITIC', lines: ['Good evening. I am the National Movie Reviewer.'] },
      { bg: 'grad', who: 'critic', side: 'R', o: { cols: ['#0b0a14', '#4e2c1c', '#7a4a2c'] }, lines: ['Tonight: "Heist at the Bank of Time." Our hero cracks a vault with a pencil and an attitude.', 'The sequel, sadly, is pure madness. A whole city hypnotized by its own television.'] },
      { bg: 'tv', o: { show: 'review' }, speaker: 'THE CRITIC', lines: ['One and a half thumbs. See it before they make it illegal.'] },
    ],
  },
  hypno: {
    song: 'madness',
    shots: [
      { bg: 'city', o: { dawn: false }, who: 'citizen', side: 'R', lines: ['OBEY. CONSUME. FORGET. OBEY. CONSUME.'] },
      { bg: 'city', who: 'deltron', lines: ['The Bank is broadcasting straight into their heads. Somebody has to change the station.'] },
    ],
  },
  cleofis: {
    track: 13, title: 'Meet Cleofis Randolph the Patriarch', song: 'cleofis',
    shots: [
      { bg: 'grad', who: 'cleofis', o: { cols: ['#0b0a14', '#17142b', '#5a3c0e'] }, lines: ['Sit down, young man. I am Cleofis Randolph. The Patriarch.', 'I have been alive since the year two thousand. Time and I have an understanding.'] },
      { bg: 'clock', o: { slip: true }, speaker: 'CLEOFIS RANDOLPH', lines: ['The Bank has started skimming the city\'s minutes. Hours slip away. Whole Tuesdays vanish.'] },
      { bg: 'grad', who: 'cleofis', o: { cols: ['#0b0a14', '#17142b', '#5a3c0e'] }, lines: ['Take this key and lock the great clock back into place. Mind the gaps.'] },
    ],
  },
  news: {
    track: 15, title: 'The News (A Wholly Owned Subsidiary of Microsoft, Inc.)', song: 'news',
    shots: [
      { bg: 'tv', o: { show: 'news' }, speaker: 'NEWS ANCHOR', col: '#a8f4f0', lines: ['Good evening. This news is a wholly owned subsidiary of the people who own you.'] },
      { bg: 'tv', o: { show: 'news' }, speaker: 'NEWS ANCHOR', col: '#a8f4f0', lines: ['Fugitive Deltron Zero has left orbit in a stolen ship, headed for the Rhyme Federation finals.', 'Authorities warn of heavy turbulence. And dancing. Mostly dancing.'] },
      { bg: 'space', who: 'pilot', side: 'R', lines: ['The arena is on the far side of the asteroid belt. Hold on to something.'] },
    ],
  },
  fantabulous2: {
    track: 17, title: 'The Fantabulous Rap Extravaganza Part II', song: 'fantabulous',
    shots: [
      { bg: 'arena', o: { flashy: true, fight: true }, speaker: 'ANNOUNCER', fx: 'flash', lines: ['WE ARE BACK! It is the FANTABULOUS RAP EXTRAVAGANZA, PART TWO! THE FINALS!'] },
      { bg: 'speed', who: 'rival', o: { cols: ['#0b0a14', '#2a0610', '#7a1426', '#d8343f'], cx: 60 }, lines: ['Four hundred years undefeated. My rhymes run on fusion.'] },
      { eyes: true, who: 'deltron', lines: ['Mine run on soul. Let\'s see whose battery dies first.'] },
      { bg: 'arena', o: { fight: true }, speaker: 'ANNOUNCER', fx: 'shake', lines: ['Rules are simple! He spits a line, you echo it on the beat, better! Microphones UP!'] },
    ],
  },
  nova: {
    song: 'lovestory',
    shots: [
      { bg: 'city', o: { roof: true, dawn: true }, speaker: '', lines: ['Galactic Rhyme Federation Champion: Deltron Zero.', 'And somebody has been waiting on a rooftop across town.'] },
      { bg: 'city', o: { roof: true, dawn: true }, who: 'love', side: 'R', lines: ['So the champ remembers me? The bank riots, third verse, you stepped on my foot. You owe me a dance.'] },
      { bg: 'city', o: { roof: true, dawn: true }, who: 'deltron', lines: ['Nothing between us but a few walls. I break walls for a living now.'] },
    ],
  },
  fade: {
    song: 'memory',
    shots: [
      { bg: 'computer', o: { red: true }, speaker: 'ASSMANN 640', col: '#d8343f', fx: 'flash', lines: ['WARNING. THE BANK HAS ISSUED A RECALL. ALL CITIZEN MEMORIES ARE BEING REPOSSESSED.'] },
      { eyes: true, who: 'deltron', lines: ['It is all going blurry. The mech. The decks. Her face...'] },
      { bg: 'lab', who: 'automator', side: 'R', lines: ['Hold on to it! Match up what you remember before it slips away!'] },
    ],
  },
  assmann: {
    track: 21, title: 'The Assmann 640 Speaks', song: 'ending',
    shots: [
      { bg: 'computer', speaker: 'ASSMANN 640', col: '#a6e34d', lines: ['HELLO. I AM THE ASSMANN 640. I HAVE BEEN LISTENING THE WHOLE TIME.'] },
      { bg: 'computer', speaker: 'ASSMANN 640', col: '#a6e34d', lines: ['THE MEMORIES HAVE BEEN RETURNED TO THEIR OWNERS. THE MUSIC HAS BEEN RETURNED TO THE AIR.'] },
      { bg: 'bank', o: { broken: true }, speaker: 'ASSMANN 640', col: '#a6e34d', lines: ['THE BANK OF TIME IS CLOSED. NO FURTHER INTEREST WILL BE CHARGED.'] },
      { bg: 'sunset', o: { sink: true }, speaker: 'ASSMANN 640', col: '#a6e34d', lines: ['I HAVE RUN THE NUMBERS. EVERY TIMELINE LOOPS BACK TO THIS ONE.', 'SEE YOU IN THREE THOUSAND THIRTY.'] },
    ],
  },
};

// The running order. Each entry is a cinema or a stage (stage ids are in stages/index.js).
export const SEQ = [
  { cine: 'open' }, { cine: 'escape' }, { stage: 'mech' },
  { cine: 'fantabulous' }, { cine: 'lab' }, { stage: 'things' },
  { cine: 'decks' }, { stage: 'contact' },
  { cine: 'stcath' }, { stage: 'virus' },
  { cine: 'brymar' }, { stage: 'upgrade' },
  { cine: 'newcoke' }, { cine: 'vaultplan' }, { stage: 'mastermind' },
  { cine: 'review' }, { cine: 'hypno' }, { stage: 'madness' },
  { cine: 'cleofis' }, { stage: 'slipping' },
  { cine: 'news' }, { stage: 'turbulence' },
  { cine: 'fantabulous2' }, { stage: 'battle' },
  { cine: 'nova' }, { stage: 'love' },
  { cine: 'fade' }, { stage: 'memory' },
  { cine: 'assmann' }, { credits: true },
];
